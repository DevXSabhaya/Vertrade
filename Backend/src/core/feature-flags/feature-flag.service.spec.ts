import { FeatureFlagsService } from './feature-flag.service';
import { FeatureFlag } from './feature-flag.entity';
import type { IFeatureFlagRepository } from './interfaces/feature-flag-repository.interface';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { FeatureFlagUpdatedEvent } from './events/feature-flag-updated.event';

describe('FeatureFlagsService', () => {
  let repository: jest.Mocked<IFeatureFlagRepository>;
  let eventBus: jest.Mocked<IEventBus>;
  let service: FeatureFlagsService;

  beforeEach(() => {
    repository = {
      findAll: jest.fn(),
      findByName: jest.fn(),
      upsert: jest.fn(),
    };
    eventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    service = new FeatureFlagsService(repository, eventBus);
  });

  it('returns false when a flag does not exist', async () => {
    repository.findByName.mockResolvedValue(null);
    await expect(service.isEnabled('paper-trading')).resolves.toBe(false);
  });

  it('returns the stored enabled value when a flag exists', async () => {
    repository.findByName.mockResolvedValue(
      new FeatureFlag('paper-trading', true, new Date()),
    );
    await expect(service.isEnabled('paper-trading')).resolves.toBe(true);
  });

  it('upserts the flag and publishes a FeatureFlagUpdatedEvent when set', async () => {
    const flag = new FeatureFlag('paper-trading', true, new Date());
    repository.upsert.mockResolvedValue(flag);

    const result = await service.setEnabled('paper-trading', true);

    expect(repository.upsert).toHaveBeenCalledWith('paper-trading', true);
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.any(FeatureFlagUpdatedEvent),
    );
    expect(result).toBe(flag);
  });

  it('returns all flags via findAll', async () => {
    const flags = [new FeatureFlag('a', true, new Date())];
    repository.findAll.mockResolvedValue(flags);
    await expect(service.findAll()).resolves.toBe(flags);
  });
});
