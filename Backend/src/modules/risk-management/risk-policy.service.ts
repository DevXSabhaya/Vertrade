import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { RISK_POLICY_REPOSITORY } from './risk-management.constants';
import type { IRiskPolicyRepository } from './interfaces/risk-policy-repository.interface';
import {
  DEFAULT_RISK_POLICY,
  type RiskPolicy,
} from './models/risk-policy.model';

/**
 * The single source of truth for the runtime-configurable Risk Policy (Part
 * 13 of the spec). Holds an in-memory cached copy — refreshed on write and
 * loaded once at boot — so every risk evaluation reads a plain object
 * instead of hitting Mongo per trade. `RecoveryCoordinator`'s restore step
 * calls `load()` again after a restart, before anything else in this module
 * touches the policy.
 */
@Injectable()
export class RiskPolicyService implements OnModuleInit {
  private current: RiskPolicy = DEFAULT_RISK_POLICY;

  constructor(
    @Inject(RISK_POLICY_REPOSITORY)
    private readonly repository: IRiskPolicyRepository,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.load();
  }

  /** Loads the persisted policy into the in-memory cache, or persists the default if none exists yet. */
  async load(): Promise<RiskPolicy> {
    const persisted = await this.repository.find();
    if (persisted) {
      this.current = persisted;
      return this.current;
    }
    this.current = DEFAULT_RISK_POLICY;
    await this.repository.save(this.current);
    return this.current;
  }

  getPolicy(): RiskPolicy {
    return this.current;
  }

  async updatePolicy(
    patch: Partial<Omit<RiskPolicy, 'updatedAt'>>,
  ): Promise<RiskPolicy> {
    const updated: RiskPolicy = {
      ...this.current,
      ...patch,
      updatedAt: this.clock.now().toISOString(),
    };
    await this.repository.save(updated);
    this.current = updated;
    return updated;
  }
}
