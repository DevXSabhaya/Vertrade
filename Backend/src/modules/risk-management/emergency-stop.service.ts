import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { EMERGENCY_STOP_STATE_REPOSITORY } from './risk-management.constants';
import type { IEmergencyStopStateRepository } from './interfaces/emergency-stop-state-repository.interface';
import {
  DEFAULT_EMERGENCY_STOP_STATE,
  type EmergencyStopState,
} from './models/emergency-stop-state.model';
import { KillSwitchStatus } from './models/kill-switch-status.enum';
import { KillSwitchService } from './kill-switch.service';
import { CooldownService } from './cooldown.service';
import { CooldownReason } from './models/cooldown.model';
import { RiskPolicyService } from './risk-policy.service';
import { RiskEventPublisher } from './risk-event-publisher';

/**
 * Part 11 of the spec. A distinct, broader trigger surface than the kill
 * switch (broker/market-data unavailability, repeated execution failures,
 * reconciliation mismatches, or a daily loss breach — not just a manual/API
 * call), but the same underlying protective action — so triggering it
 * delegates the actual "cancel pending entries / force-exit open positions"
 * work to `KillSwitchService.activate(EMERGENCY_STOP, ...)` rather than
 * duplicating that logic. Idempotent: calling `trigger()` while already
 * active is a no-op that returns the existing state without re-running the
 * protective action or re-publishing the event a second time.
 */
@Injectable()
export class EmergencyStopService implements OnModuleInit {
  private cached: EmergencyStopState = {
    ...DEFAULT_EMERGENCY_STOP_STATE,
    updatedAt: new Date(0).toISOString(),
  };

  constructor(
    @Inject(EMERGENCY_STOP_STATE_REPOSITORY)
    private readonly repository: IEmergencyStopStateRepository,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly killSwitchService: KillSwitchService,
    private readonly cooldownService: CooldownService,
    private readonly riskPolicyService: RiskPolicyService,
    private readonly eventPublisher: RiskEventPublisher,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<EmergencyStopState> {
    const persisted = await this.repository.find();
    this.cached = persisted ?? {
      ...DEFAULT_EMERGENCY_STOP_STATE,
      updatedAt: this.clock.now().toISOString(),
    };
    if (!persisted) {
      await this.repository.save(this.cached);
    }
    return this.cached;
  }

  getState(): EmergencyStopState {
    return this.cached;
  }

  isActive(): boolean {
    return this.cached.active;
  }

  async trigger(
    reason: string,
    triggeredBy: string,
  ): Promise<EmergencyStopState> {
    if (this.cached.active) {
      return this.cached; // idempotent
    }

    const now = this.clock.now().toISOString();
    const updated: EmergencyStopState = {
      active: true,
      reason,
      triggeredBy,
      triggeredAt: now,
      resetAt: null,
      updatedAt: now,
    };
    await this.repository.save(updated);
    this.cached = updated;
    this.eventPublisher.emergencyStopActivated(reason, triggeredBy);

    const policy = this.riskPolicyService.getPolicy();
    await this.killSwitchService.activate(
      KillSwitchStatus.EMERGENCY_STOP,
      reason,
      triggeredBy,
      policy.killSwitchForceExitsPositions,
    );
    await this.cooldownService.start(
      CooldownReason.EMERGENCY_EXIT,
      policy.cooldownAfterEmergencyExitMs,
    );

    return updated;
  }

  async reset(resetBy: string): Promise<EmergencyStopState> {
    if (!this.cached.active) {
      return this.cached; // idempotent
    }

    const now = this.clock.now().toISOString();
    const updated: EmergencyStopState = {
      active: false,
      reason: this.cached.reason,
      triggeredBy: this.cached.triggeredBy,
      triggeredAt: this.cached.triggeredAt,
      resetAt: now,
      updatedAt: now,
    };
    await this.repository.save(updated);
    this.cached = updated;
    this.eventPublisher.emergencyStopReset(resetBy);

    // Resetting emergency stop never automatically re-enables trading — the
    // kill switch (still EMERGENCY_STOP) must be explicitly deactivated
    // separately, so an operator always makes that decision deliberately.
    return updated;
  }
}
