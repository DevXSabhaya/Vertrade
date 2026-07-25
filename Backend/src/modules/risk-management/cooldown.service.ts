import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { StopLossHitEvent } from '@modules/trading-engine/events/stop-loss-hit.event';
import { COOLDOWN_STATE_REPOSITORY } from './risk-management.constants';
import type { ICooldownStateRepository } from './interfaces/cooldown-state-repository.interface';
import { CooldownReason, type CooldownState } from './models/cooldown.model';
import { RiskEventPublisher } from './risk-event-publisher';
import { RiskPolicyService } from './risk-policy.service';

/**
 * Part 8 of the spec. A single active cooldown at a time (the most recent
 * one wins) — this system has one trading account, so there is only ever
 * one cooldown clock to run. Auto-starts on `StopLossHitEvent` when
 * `RiskPolicy.cooldownAfterLossMs > 0`; `DailyRiskStateService` /
 * `KillSwitchService` / `EmergencyStopService` each call `start()`
 * explicitly for their own trigger conditions (daily loss, consecutive
 * losses, emergency exit).
 */
@Injectable()
export class CooldownService implements OnModuleInit {
  private cached: CooldownState | null = null;
  private loaded = false;

  constructor(
    @Inject(COOLDOWN_STATE_REPOSITORY)
    private readonly repository: ICooldownStateRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly riskPolicyService: RiskPolicyService,
    private readonly eventPublisher: RiskEventPublisher,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.load();
    this.eventBus.subscribe<StopLossHitEvent>(
      StopLossHitEvent.EVENT_NAME,
      () => {
        void this.onStopLossHit();
      },
    );
  }

  private async load(): Promise<void> {
    this.cached = await this.repository.find();
    this.loaded = true;
  }

  /** Forces a fresh read from the repository — used by Recovery's restore step to re-verify persisted state after a restart, rather than trusting whatever `onModuleInit()` already cached. */
  async reload(): Promise<CooldownState | null> {
    await this.load();
    return this.cached;
  }

  /** Returns the active cooldown, or `null` — expiring it first if its `expiresAt` has already passed. */
  async getActiveCooldown(): Promise<CooldownState | null> {
    if (!this.loaded) {
      await this.load();
    }
    if (
      this.cached &&
      new Date(this.cached.expiresAt).getTime() <= this.clock.now().getTime()
    ) {
      await this.end();
    }
    return this.cached;
  }

  async start(
    reason: CooldownReason,
    durationMs: number,
  ): Promise<CooldownState | null> {
    if (durationMs <= 0) {
      return this.cached;
    }
    const now = this.clock.now();
    const state: CooldownState = {
      reason,
      startedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + durationMs).toISOString(),
    };
    await this.repository.save(state);
    this.cached = state;
    this.loaded = true;
    this.eventPublisher.cooldownStarted(reason, state.expiresAt);
    return state;
  }

  async end(): Promise<void> {
    if (!this.cached) {
      return;
    }
    const reason = this.cached.reason;
    await this.repository.save(null);
    this.cached = null;
    this.loaded = true;
    this.eventPublisher.cooldownEnded(reason);
  }

  /** Called by the scheduler's maintenance job — a no-op unless the active cooldown has actually expired. */
  async expireIfDue(): Promise<void> {
    await this.getActiveCooldown();
  }

  private async onStopLossHit(): Promise<void> {
    const policy = this.riskPolicyService.getPolicy();
    if (policy.cooldownAfterLossMs > 0) {
      await this.start(
        CooldownReason.STOP_LOSS_HIT,
        policy.cooldownAfterLossMs,
      );
    }
  }
}
