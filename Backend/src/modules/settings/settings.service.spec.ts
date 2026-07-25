import { SettingsService } from './settings.service';
import { Setting } from './settings.entity';
import type { ISettingsRepository } from './interfaces/settings-repository.interface';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { SettingUpdatedEvent } from './events/setting-updated.event';

describe('SettingsService', () => {
  let repository: jest.Mocked<ISettingsRepository>;
  let eventBus: jest.Mocked<IEventBus>;
  let service: SettingsService;

  beforeEach(() => {
    repository = {
      findAll: jest.fn(),
      findByKey: jest.fn(),
      upsert: jest.fn(),
    };
    eventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    service = new SettingsService(repository, eventBus);
  });

  it('is empty before onModuleInit loads settings', () => {
    expect(service.get('defaultLot')).toBeUndefined();
  });

  it('populates the in-memory cache from the repository on module init', async () => {
    repository.findAll.mockResolvedValue([
      new Setting('defaultLot', 1, new Date()),
    ]);

    await service.onModuleInit();

    expect(service.get<number>('defaultLot')).toBe(1);
  });

  it('reads from the cache, not the repository, after init', async () => {
    repository.findAll.mockResolvedValue([
      new Setting('defaultLot', 1, new Date()),
    ]);
    await service.onModuleInit();

    service.get('defaultLot');

    expect(repository.findByKey).not.toHaveBeenCalled();
  });

  it('set() updates the repository, the cache, and publishes an event', async () => {
    const setting = new Setting('defaultLot', 5, new Date());
    repository.upsert.mockResolvedValue(setting);

    const result = await service.set('defaultLot', 5, 'admin');

    expect(repository.upsert).toHaveBeenCalledWith('defaultLot', 5, 'admin');
    expect(service.get<number>('defaultLot')).toBe(5);
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.any(SettingUpdatedEvent),
    );
    expect(result).toBe(setting);
  });
});
