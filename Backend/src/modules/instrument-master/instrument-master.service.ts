import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { Instrument } from './entities/instrument.entity';
import {
  InstrumentCache,
  type InstrumentCacheSnapshot,
} from './instrument-master.cache';
import {
  INSTRUMENT_MASTER_PROVIDER,
  INSTRUMENT_REPOSITORY,
} from './instrument-master.constants';
import type { IInstrumentMasterProvider } from './interfaces/instrument-master-provider.interface';
import type { IInstrumentRepository } from './interfaces/instrument-repository.interface';
import { InstrumentMasterEmptyException } from './exceptions/instrument-master-empty.exception';
import { InstrumentMasterLoadingStartedEvent } from './events/instrument-master-loading-started.event';
import { InstrumentMasterLoadedEvent } from './events/instrument-master-loaded.event';
import { InstrumentMasterRefreshStartedEvent } from './events/instrument-master-refresh-started.event';
import { InstrumentMasterRefreshCompletedEvent } from './events/instrument-master-refresh-completed.event';
import { InstrumentMasterRefreshFailedEvent } from './events/instrument-master-refresh-failed.event';

/**
 * Orchestrates loading and refreshing the instrument master. Never touches
 * MongoDB or a broker HTTP client directly — both are behind interfaces —
 * and never blocks the resolver's reads: the cache is the only thing
 * InstrumentResolverService talks to.
 */
@Injectable()
export class InstrumentMasterService implements OnModuleInit {
  private readonly logger = new Logger(InstrumentMasterService.name);

  constructor(
    @Inject(INSTRUMENT_MASTER_PROVIDER)
    private readonly provider: IInstrumentMasterProvider,
    @Inject(INSTRUMENT_REPOSITORY)
    private readonly repository: IInstrumentRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    private readonly cache: InstrumentCache,
  ) {}

  /**
   * Startup is network-free by design: only the MongoDB backup (fast, local)
   * is loaded here. The live broker download only ever happens via refresh()
   * — invoked manually, on the daily cron, or by a future Scheduler's
   * Morning Startup routine — so process boot never blocks on, or depends
   * on, external network availability.
   */
  async onModuleInit(): Promise<void> {
    this.eventBus.publish(new InstrumentMasterLoadingStartedEvent());

    const backup = await this.repository.findLatestSnapshot().catch(() => null);
    if (backup && backup.instruments.length > 0) {
      this.cache.swap(backup.instruments);
      const snapshot = this.cache.getSnapshot();
      this.eventBus.publish(
        new InstrumentMasterLoadedEvent(
          snapshot.version,
          snapshot.instrumentCount,
        ),
      );
    } else {
      this.logger.warn(
        'No instrument master backup available at startup; call refresh() to load one.',
      );
    }
  }

  /** Runs once daily; also invoked directly for manual refresh. */
  @Cron('0 8 * * *')
  async refresh(): Promise<InstrumentCacheSnapshot> {
    this.eventBus.publish(new InstrumentMasterRefreshStartedEvent());

    try {
      const instruments = await this.provider.fetchInstruments();
      if (instruments.length === 0) {
        throw new InstrumentMasterEmptyException(
          'Instrument master fetch returned zero instruments',
        );
      }

      const snapshot = this.cache.swap(instruments);

      await this.repository
        .saveSnapshot(instruments, snapshot.version)
        .catch((error: unknown) => {
          this.logger.warn(
            `Failed to persist instrument master backup: ${this.describeError(error)}`,
          );
        });

      this.eventBus.publish(
        new InstrumentMasterRefreshCompletedEvent(
          snapshot.version,
          snapshot.instrumentCount,
        ),
      );
      return snapshot;
    } catch (error) {
      this.eventBus.publish(
        new InstrumentMasterRefreshFailedEvent(this.describeError(error)),
      );
      throw error;
    }
  }

  getCache(): InstrumentCache {
    return this.cache;
  }

  search(query: string, limit = 20): readonly Instrument[] {
    return this.cache.search(query, limit);
  }

  getSnapshot(): InstrumentCacheSnapshot {
    return this.cache.getSnapshot();
  }

  private describeError(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Unknown instrument master error';
  }
}
