import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { TargetHitEvent } from '@modules/trading-engine/events/target-hit.event';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { TradeExtensionStore } from './trade-extension.store';
import { ExitManager } from './exit-manager.service';
import { ExitReason } from './models/exit-reason.enum';

export interface TargetProgress {
  readonly tradeId: string;
  readonly targetsHit: number;
  readonly totalTargets: number;
  readonly nextTarget: number | null;
}

/**
 * Target *detection* and *progression* already live in `Trade.advancePrice()`
 * (Phase 5) — this manager never re-implements that. Its own job is the
 * genuinely new Phase 10 capability: optionally booking a partial exit the
 * instant a target is hit, when a trade's extension carries a
 * `targetExitQuantities` plan (opt-in — a trade with no plan configured
 * behaves exactly as it always has, trailing only, no partial booking).
 */
@Injectable()
export class TargetManager implements OnModuleInit {
  private readonly logger = new Logger(TargetManager.name);

  constructor(
    private readonly tradingEngineService: TradingEngineService,
    private readonly extensionStore: TradeExtensionStore,
    private readonly exitManager: ExitManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<TargetHitEvent>(
      TargetHitEvent.EVENT_NAME,
      (event) => {
        void this.onTargetHit(event);
      },
    );
  }

  /** Quantity to book at each target index (parallel to the trade's own `targets` array); pass an empty array to disable partial-exit-on-target (trail only, the default). */
  async configureTargetExitPlan(
    tradeId: string,
    targetExitQuantities: readonly number[],
  ): Promise<void> {
    await this.extensionStore.patch(tradeId, { targetExitQuantities });
  }

  getTargetProgress(tradeId: string): TargetProgress {
    const trade = this.tradingEngineService.getTrade(tradeId);
    const targetsHit = trade.targets.length - trade.remainingTargets.length;
    return {
      tradeId,
      targetsHit,
      totalTargets: trade.targets.length,
      nextTarget: trade.remainingTargets[0] ?? null,
    };
  }

  private async onTargetHit(event: TargetHitEvent): Promise<void> {
    const extension = await this.extensionStore.get(event.tradeId);
    const plannedQuantity = extension.targetExitQuantities[event.targetIndex];
    if (plannedQuantity === undefined || plannedQuantity <= 0) {
      return;
    }

    try {
      await this.exitManager.requestPartialExit(
        event.tradeId,
        plannedQuantity,
        ExitReason.TARGET,
      );
    } catch (error) {
      this.logger.warn(
        `Target-triggered partial exit failed for trade ${event.tradeId} at target index ${event.targetIndex}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}
