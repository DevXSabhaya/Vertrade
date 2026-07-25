import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { Setting } from './settings.entity';
import { SETTINGS_REPOSITORY } from './settings.constants';
import type { ISettingsRepository } from './interfaces/settings-repository.interface';
import { SettingUpdatedEvent } from './events/setting-updated.event';

/**
 * Cache-ready: all settings are loaded into memory once at startup, and every
 * write updates both the store and the cache before publishing an event — so
 * reads never block on a database round trip.
 */
@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly cache = new Map<string, unknown>();

  constructor(
    @Inject(SETTINGS_REPOSITORY)
    private readonly repository: ISettingsRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async onModuleInit(): Promise<void> {
    const settings = await this.repository.findAll();
    for (const setting of settings) {
      this.cache.set(setting.key, setting.value);
    }
  }

  get<T>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined;
  }

  async set(key: string, value: unknown, updatedBy?: string): Promise<Setting> {
    const setting = await this.repository.upsert(key, value, updatedBy);
    this.cache.set(key, value);
    this.eventBus.publish(new SettingUpdatedEvent(key, value));
    return setting;
  }
}
