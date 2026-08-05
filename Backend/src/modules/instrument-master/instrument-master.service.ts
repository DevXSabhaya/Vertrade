import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { ConfigService } from '@core/config/config.service';
import {
  InstrumentCache,
  type InstrumentCacheSnapshot,
} from './instrument-master.cache';
import {
  PRIMARY_INSTRUMENT_MASTER_PROVIDER,
  INSTRUMENT_REPOSITORY,
} from './instrument-master.constants';
import type { IInstrumentMasterProvider } from './interfaces/instrument-master-provider.interface';
import type {
  IInstrumentRepository,
  InstrumentSourceProvider,
} from './interfaces/instrument-repository.interface';
import type { Instrument } from './entities/instrument.entity';
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
 *
 * Depends only on `IInstrumentMasterProvider` (bound once, at module-wiring
 * time, to whichever concrete provider `ConfigService.instrumentMasterProvider`
 * selects). Instrument Master never switches based on Trading Mode (Core
 * Architecture Principle #2) — Paper and Live always resolve against the
 * exact same instrument universe.
 */
@Injectable()
export class InstrumentMasterService implements OnModuleInit {
  private readonly logger = new Logger(InstrumentMasterService.name);
  private readonly sourceProvider: InstrumentSourceProvider;

  constructor(
    @Inject(PRIMARY_INSTRUMENT_MASTER_PROVIDER)
    private readonly provider: IInstrumentMasterProvider,
    @Inject(INSTRUMENT_REPOSITORY)
    private readonly repository: IInstrumentRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    private readonly cache: InstrumentCache,
    configService: ConfigService,
  ) {
    this.sourceProvider = configService.instrumentMasterProvider;
  }

  /**
   * Startup is network-free by design: only the MongoDB backup (fast, local)
   * is loaded here. The live broker download only ever happens via refresh()
   * — invoked manually, on the daily cron, or by the Scheduler's Morning
   * Startup routine — so process boot never blocks on, or depends on,
   * external network availability.
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
      if (backup.sourceProvider !== this.sourceProvider) {
        // The restored backup came from a different source than this
        // deployment is currently configured for — trigger an immediate
        // corrective refresh rather than trusting a possibly-wrong-source
        // cache. Fire-and-forget: must never delay process boot.
        this.refresh().catch((error: unknown) => {
          this.logger.warn(
            `Instrument master provenance mismatch (backup was ${String(backup.sourceProvider)}, expected ${this.sourceProvider}) and the corrective refresh failed: ${this.describeError(error)}`,
          );
        });
      }
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
      await this.persistBackup(instruments, snapshot);

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

  private async persistBackup(
    instruments: Instrument[],
    snapshot: InstrumentCacheSnapshot,
  ): Promise<void> {
    await this.repository
      .saveSnapshot(instruments, snapshot.version, this.sourceProvider)
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to persist instrument master backup: ${this.describeError(error)}`,
        );
      });
  }

  private describeError(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Unknown instrument master error';
  }
}
