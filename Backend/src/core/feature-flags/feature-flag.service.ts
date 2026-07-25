import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { FeatureFlag } from './feature-flag.entity';
import { FEATURE_FLAG_REPOSITORY } from './feature-flags.constants';
import type { IFeatureFlagRepository } from './interfaces/feature-flag-repository.interface';
import { FeatureFlagUpdatedEvent } from './events/feature-flag-updated.event';

@Injectable()
export class FeatureFlagsService {
  constructor(
    @Inject(FEATURE_FLAG_REPOSITORY)
    private readonly repository: IFeatureFlagRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async isEnabled(name: string): Promise<boolean> {
    const flag = await this.repository.findByName(name);
    return flag?.enabled ?? false;
  }

  async findAll(): Promise<FeatureFlag[]> {
    return this.repository.findAll();
  }

  async setEnabled(name: string, enabled: boolean): Promise<FeatureFlag> {
    const flag = await this.repository.upsert(name, enabled);
    this.eventBus.publish(new FeatureFlagUpdatedEvent(name, enabled));
    return flag;
  }
}
