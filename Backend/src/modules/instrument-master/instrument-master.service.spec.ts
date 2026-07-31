import { InstrumentMasterService } from './instrument-master.service';
import { InstrumentCache } from './instrument-master.cache';
import { Instrument } from './entities/instrument.entity';
import type { IInstrumentMasterProvider } from './interfaces/instrument-master-provider.interface';
import type {
  IInstrumentRepository,
  InstrumentMasterSnapshot,
} from './interfaces/instrument-repository.interface';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { InstrumentMasterLoadingStartedEvent } from './events/instrument-master-loading-started.event';
import { InstrumentMasterLoadedEvent } from './events/instrument-master-loaded.event';
import { InstrumentMasterRefreshStartedEvent } from './events/instrument-master-refresh-started.event';
import { InstrumentMasterRefreshCompletedEvent } from './events/instrument-master-refresh-completed.event';
import { InstrumentMasterRefreshFailedEvent } from './events/instrument-master-refresh-failed.event';

function makeInstrument(token = 'TOK1'): Instrument {
  return new Instrument(
    token,
    'NFO',
    'OPTIDX',
    'NIFTY24500CE',
    'NIFTY',
    null,
    24500,
    null,
    50,
    0.05,
    2,
  );
}

describe('InstrumentMasterService', () => {
  // `provider` is the MOCK-slot fake — the service's default active
  // provider — driven directly by the pre-existing tests below.
  // `dhanProvider` is the DHAN-slot fake, exercised by the dedicated
  // provider-switching tests further down.
  let provider: jest.Mocked<IInstrumentMasterProvider>;
  let dhanProvider: jest.Mocked<IInstrumentMasterProvider>;
  let repository: jest.Mocked<IInstrumentRepository>;
  let eventBus: jest.Mocked<IEventBus>;
  let cache: InstrumentCache;
  let service: InstrumentMasterService;

  beforeEach(() => {
    provider = { brokerName: 'test-broker', fetchInstruments: jest.fn() };
    dhanProvider = { brokerName: 'dhan', fetchInstruments: jest.fn() };
    repository = {
      saveSnapshot: jest.fn().mockResolvedValue(undefined),
      findLatestSnapshot: jest.fn(),
    };
    eventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    cache = new InstrumentCache();
    service = new InstrumentMasterService(
      provider,
      dhanProvider,
      repository,
      eventBus,
      cache,
    );
  });

  describe('onModuleInit', () => {
    it('restores from backup and publishes Loaded — WITHOUT calling the provider (network-free startup)', async () => {
      const backupSnapshot: InstrumentMasterSnapshot = {
        version: 1,
        savedAt: new Date(),
        instruments: [makeInstrument('BACKUP')],
        sourceProvider: 'MOCK',
      };
      repository.findLatestSnapshot.mockResolvedValue(backupSnapshot);

      await service.onModuleInit();

      expect(cache.findByToken('BACKUP')).toBeDefined();
      expect(provider.fetchInstruments).not.toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.any(InstrumentMasterLoadingStartedEvent),
      );
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.any(InstrumentMasterLoadedEvent),
      );
    });

    it('does not publish Loaded when there is no backup available', async () => {
      repository.findLatestSnapshot.mockResolvedValue(null);

      await service.onModuleInit();

      expect(cache.isLoaded()).toBe(false);
      expect(provider.fetchInstruments).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalledWith(
        expect.any(InstrumentMasterLoadedEvent),
      );
    });

    it('does not publish Loaded when the backup lookup itself fails', async () => {
      repository.findLatestSnapshot.mockRejectedValue(new Error('mongo down'));

      await service.onModuleInit();

      expect(cache.isLoaded()).toBe(false);
      expect(eventBus.publish).not.toHaveBeenCalledWith(
        expect.any(InstrumentMasterLoadedEvent),
      );
    });
  });

  describe('refresh', () => {
    it('publishes Started then Completed and swaps the cache on success', async () => {
      provider.fetchInstruments.mockResolvedValue([makeInstrument()]);

      const snapshot = await service.refresh();

      expect(snapshot.instrumentCount).toBe(1);
      expect(eventBus.publish).toHaveBeenNthCalledWith(
        1,
        expect.any(InstrumentMasterRefreshStartedEvent),
      );
      expect(eventBus.publish).toHaveBeenNthCalledWith(
        2,
        expect.any(InstrumentMasterRefreshCompletedEvent),
      );
    });

    it('persists a backup snapshot after a successful refresh', async () => {
      provider.fetchInstruments.mockResolvedValue([makeInstrument()]);
      await service.refresh();
      expect(repository.saveSnapshot).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Number),
        'MOCK',
      );
    });

    it('publishes RefreshFailed and rethrows when the provider fails, WITHOUT touching the cache', async () => {
      cache.swap([makeInstrument('EXISTING')]);
      provider.fetchInstruments.mockRejectedValue(new Error('boom'));

      await expect(service.refresh()).rejects.toThrow('boom');

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.any(InstrumentMasterRefreshFailedEvent),
      );
      expect(cache.findByToken('EXISTING')).toBeDefined();
    });

    it('publishes RefreshFailed when the provider returns zero instruments', async () => {
      provider.fetchInstruments.mockResolvedValue([]);
      await expect(service.refresh()).rejects.toThrow();
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.any(InstrumentMasterRefreshFailedEvent),
      );
    });

    it('does not fail the refresh if only the backup persistence fails', async () => {
      provider.fetchInstruments.mockResolvedValue([makeInstrument()]);
      repository.saveSnapshot.mockRejectedValue(new Error('mongo down'));

      await expect(service.refresh()).resolves.toBeDefined();
      expect(cache.isLoaded()).toBe(true);
    });
  });

  describe('getCache / getSnapshot', () => {
    it('exposes the underlying cache and its snapshot', async () => {
      provider.fetchInstruments.mockResolvedValue([makeInstrument()]);
      await service.refresh();

      expect(service.getCache()).toBe(cache);
      expect(service.getSnapshot().instrumentCount).toBe(1);
    });
  });

  describe('provider switching (initializeForMode/prepare/commit)', () => {
    it('refresh() uses the MOCK provider by default', async () => {
      provider.fetchInstruments.mockResolvedValue([makeInstrument()]);

      await service.refresh();

      expect(provider.fetchInstruments).toHaveBeenCalledTimes(1);
      expect(dhanProvider.fetchInstruments).not.toHaveBeenCalled();
    });

    it('initializeForMode(LIVE) makes refresh() use the DHAN provider', async () => {
      service.initializeForMode('LIVE');
      dhanProvider.fetchInstruments.mockResolvedValue([makeInstrument()]);

      await service.refresh();

      expect(dhanProvider.fetchInstruments).toHaveBeenCalledTimes(1);
      expect(provider.fetchInstruments).not.toHaveBeenCalled();
    });

    it('prepareRefreshForMode fetches from the target provider without touching the cache', async () => {
      cache.swap([makeInstrument('EXISTING')]);
      dhanProvider.fetchInstruments.mockResolvedValue([makeInstrument('NEW')]);

      const fetched = await service.prepareRefreshForMode('LIVE');

      expect(fetched[0]?.token).toBe('NEW');
      expect(cache.findByToken('EXISTING')).toBeDefined();
      expect(cache.findByToken('NEW')).toBeUndefined();
    });

    it('prepareRefreshForMode throws when the target provider returns zero instruments', async () => {
      dhanProvider.fetchInstruments.mockResolvedValue([]);
      await expect(service.prepareRefreshForMode('LIVE')).rejects.toThrow();
    });

    it('commitInstrumentSwitch atomically swaps the cache, flips the active provider, and persists with the correct sourceProvider', async () => {
      const instruments = [makeInstrument('NEW')];

      await service.commitInstrumentSwitch('LIVE', instruments);

      expect(cache.findByToken('NEW')).toBeDefined();
      expect(repository.saveSnapshot).toHaveBeenCalledWith(
        instruments,
        expect.any(Number),
        'DHAN',
      );

      // Subsequent refresh() now hits DHAN, confirming the active provider flipped.
      dhanProvider.fetchInstruments.mockResolvedValue([
        makeInstrument('AGAIN'),
      ]);
      await service.refresh();
      expect(dhanProvider.fetchInstruments).toHaveBeenCalledTimes(1);
      expect(provider.fetchInstruments).not.toHaveBeenCalled();
    });
  });

  describe('refreshIfSourceMismatch', () => {
    it('does nothing when the restored backup already matches the current mode', async () => {
      repository.findLatestSnapshot.mockResolvedValue({
        version: 1,
        savedAt: new Date(),
        instruments: [makeInstrument()],
        sourceProvider: 'MOCK',
      });
      await service.onModuleInit();

      await service.refreshIfSourceMismatch('PAPER');

      expect(provider.fetchInstruments).not.toHaveBeenCalled();
      expect(dhanProvider.fetchInstruments).not.toHaveBeenCalled();
    });

    it('triggers a refresh from the correct provider when the restored backup came from the wrong source', async () => {
      repository.findLatestSnapshot.mockResolvedValue({
        version: 1,
        savedAt: new Date(),
        instruments: [makeInstrument()],
        sourceProvider: 'MOCK',
      });
      await service.onModuleInit();
      dhanProvider.fetchInstruments.mockResolvedValue([
        makeInstrument('FRESH'),
      ]);

      await service.refreshIfSourceMismatch('LIVE');

      expect(dhanProvider.fetchInstruments).toHaveBeenCalledTimes(1);
    });

    it('treats a legacy backup with no sourceProvider (null) as always stale', async () => {
      repository.findLatestSnapshot.mockResolvedValue({
        version: 1,
        savedAt: new Date(),
        instruments: [makeInstrument()],
        sourceProvider: null,
      });
      await service.onModuleInit();

      await service.refreshIfSourceMismatch('PAPER');

      expect(provider.fetchInstruments).toHaveBeenCalledTimes(1);
    });

    it('never throws even when the corrective refresh itself fails', async () => {
      repository.findLatestSnapshot.mockResolvedValue({
        version: 1,
        savedAt: new Date(),
        instruments: [makeInstrument()],
        sourceProvider: 'MOCK',
      });
      await service.onModuleInit();
      dhanProvider.fetchInstruments.mockRejectedValue(new Error('down'));

      await expect(
        service.refreshIfSourceMismatch('LIVE'),
      ).resolves.toBeUndefined();
    });
  });
});
