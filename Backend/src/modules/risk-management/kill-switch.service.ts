import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import { TradeStateTransitions } from '@modules/trading-engine/domain/trade-state-transitions';
import { ExitManager } from '@modules/trade-lifecycle/exit-manager.service';
import { KILL_SWITCH_STATE_REPOSITORY } from './risk-management.constants';
import type { IKillSwitchStateRepository } from './interfaces/kill-switch-state-repository.interface';
import {
  DEFAULT_KILL_SWITCH_STATE,
  type KillSwitchState,
} from './models/kill-switch-state.model';
import { KillSwitchStatus } from './models/kill-switch-status.enum';
import { RiskEventPublisher } from './risk-event-publisher';

/**
 * The global kill switch (Part 10). Distinct from — and layered on top of —
 * the static, per-process `ConfigService.killSwitchEnabled` env var already
 * checked in `FeatureFlagRule`/`OrderQueueService.submitTrade()` (Phase 5/7):
 * this one is dynamic (DB-persisted, API-activatable, three states) rather
 * than requiring a redeploy to toggle. Idempotent: activating an
 * already-active state (same target status) or deactivating an already-ACTIVE
 * switch is a no-op that still returns the current state, never double-fires
 * an event or a duplicate force-exit pass.
 */
@Injectable()
export class KillSwitchService implements OnModuleInit {
  private readonly logger = new Logger(KillSwitchService.name);
  private cached: KillSwitchState = {
    ...DEFAULT_KILL_SWITCH_STATE,
    updatedAt: new Date(0).toISOString(),
  };

  constructor(
    @Inject(KILL_SWITCH_STATE_REPOSITORY)
    private readonly repository: IKillSwitchStateRepository,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly tradingEngineService: TradingEngineService,
    private readonly exitManager: ExitManager,
    private readonly eventPublisher: RiskEventPublisher,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<KillSwitchState> {
    const persisted = await this.repository.find();
    this.cached = persisted ?? {
      ...DEFAULT_KILL_SWITCH_STATE,
      updatedAt: this.clock.now().toISOString(),
    };
    if (!persisted) {
      await this.repository.save(this.cached);
    }
    return this.cached;
  }

  getState(): KillSwitchState {
    return this.cached;
  }

  isBlocking(): boolean {
    return this.cached.status !== KillSwitchStatus.ACTIVE;
  }

  /**
   * Activates the kill switch. `TRADING_DISABLED` only blocks new entries;
   * `EMERGENCY_STOP` additionally cancels every non-ACTIVE (pre-fill)
   * pending trade and, when the policy says so, force-exits every ACTIVE
   * position via `ExitManager` — the same primitive Phase 10's own
   * `emergencyExitAll()` uses, never a second execution path.
   */
  async activate(
    status: KillSwitchStatus.TRADING_DISABLED | KillSwitchStatus.EMERGENCY_STOP,
    reason: string,
    activatedBy: string,
    forceExitPositions: boolean,
  ): Promise<KillSwitchState> {
    if (this.cached.status === status) {
      return this.cached; // idempotent: already in the requested state
    }

    const now = this.clock.now().toISOString();
    const updated: KillSwitchState = {
      status,
      reason,
      activatedBy,
      activatedAt: now,
      deactivatedAt: null,
      updatedAt: now,
    };
    await this.repository.save(updated);
    this.cached = updated;
    this.eventPublisher.killSwitchActivated(status, reason, activatedBy);

    if (status === KillSwitchStatus.EMERGENCY_STOP) {
      await this.cancelPendingEntries();
      if (forceExitPositions) {
        await this.exitManager.emergencyExitAll();
      }
    }

    return updated;
  }

  async deactivate(deactivatedBy: string): Promise<KillSwitchState> {
    if (this.cached.status === KillSwitchStatus.ACTIVE) {
      return this.cached; // idempotent: already active/normal
    }

    const now = this.clock.now().toISOString();
    const updated: KillSwitchState = {
      status: KillSwitchStatus.ACTIVE,
      reason: null,
      activatedBy: null,
      activatedAt: null,
      deactivatedAt: now,
      updatedAt: now,
    };
    await this.repository.save(updated);
    this.cached = updated;
    this.eventPublisher.killSwitchDeactivated(deactivatedBy);
    return updated;
  }

  private async cancelPendingEntries(): Promise<void> {
    const pending = this.tradingEngineService
      .getAllTrades()
      .filter(
        (trade) =>
          !TradeStateTransitions.isTerminal(trade.state) &&
          trade.state !== TradeState.ACTIVE &&
          trade.state !== TradeState.TARGET_HIT &&
          trade.state !== TradeState.TRAILING_SL_UPDATED,
      );
    for (const trade of pending) {
      try {
        await this.tradingEngineService.cancelTrade(
          trade.id,
          'Kill switch: emergency stop activated',
        );
      } catch (error) {
        this.logger.warn(
          `Failed to cancel pending trade ${trade.id} during kill switch activation: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }
    }
  }
}
