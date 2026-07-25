import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { TradeCompletedEvent } from '@modules/trading-engine/events/trade-completed.event';
import { DAILY_RISK_STATE_REPOSITORY } from './risk-management.constants';
import type { IDailyRiskStateRepository } from './interfaces/daily-risk-state-repository.interface';
import {
  emptyDailyRiskState,
  type DailyRiskState,
} from './models/daily-risk-state.model';
import { RiskEventPublisher } from './risk-event-publisher';
import { RiskPolicyService } from './risk-policy.service';

/**
 * Tracks the one piece of state the frozen `Trade` aggregate has no concept
 * of at all: a running, per-UTC-day tally of realized PnL, trade count, and
 * consecutive losing trades (Part 9 of the spec) — built entirely from
 * `TradeCompletedEvent` (Phase 5, unchanged), never by re-deriving it from
 * `TradingEngineService.getAllTrades()` on every read the way the older,
 * simpler `RiskRule` (Phase 7) does — this state must survive a restart and
 * be updated incrementally, not recomputed from an in-memory-only source
 * that a restart already wipes.
 */
@Injectable()
export class DailyRiskStateService implements OnModuleInit {
  private cached: DailyRiskState | null = null;

  constructor(
    @Inject(DAILY_RISK_STATE_REPOSITORY)
    private readonly repository: IDailyRiskStateRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly riskPolicyService: RiskPolicyService,
    private readonly eventPublisher: RiskEventPublisher,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.getState();
    this.eventBus.subscribe<TradeCompletedEvent>(
      TradeCompletedEvent.EVENT_NAME,
      (event) => {
        void this.recordTradeOutcome(event.realizedPnl);
      },
    );
  }

  /** Returns today's state, rolling over to a fresh row first if the UTC date has changed since it was last loaded. */
  async getState(): Promise<DailyRiskState> {
    const today = this.currentTradeDate();
    if (this.cached && this.cached.tradeDate === today) {
      return this.cached;
    }

    const persisted = await this.repository.find(today);
    this.cached =
      persisted ?? emptyDailyRiskState(today, this.clock.now().toISOString());
    if (!persisted) {
      await this.repository.save(this.cached);
    }
    return this.cached;
  }

  /** Idempotent with respect to day rollover — explicitly callable by the scheduler's maintenance job in addition to the lazy check in `getState()`. */
  async resetIfNewDay(): Promise<void> {
    await this.getState();
  }

  async recordTradeOutcome(realizedPnl: number): Promise<DailyRiskState> {
    const state = await this.getState();
    const wasLoss = realizedPnl < 0;
    const consecutiveLosses = wasLoss ? state.consecutiveLosses + 1 : 0;

    const updated: DailyRiskState = {
      tradeDate: state.tradeDate,
      realizedPnl: state.realizedPnl + realizedPnl,
      tradeCount: state.tradeCount + 1,
      consecutiveLosses,
      lastTradeWasLoss: wasLoss,
      updatedAt: this.clock.now().toISOString(),
    };
    await this.repository.save(updated);
    this.cached = updated;

    const policy = this.riskPolicyService.getPolicy();
    if (wasLoss && consecutiveLosses >= policy.maxConsecutiveLosses) {
      this.eventPublisher.consecutiveLossLimitBreached(
        consecutiveLosses,
        policy.maxConsecutiveLosses,
      );
    }

    return updated;
  }

  private currentTradeDate(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }
}
