import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { TradingMode } from '@modules/trading-engine/domain/trading-mode.type';
import type { Instrument } from './entities/instrument.entity';
import {
  InstrumentCache,
  type InstrumentCacheSnapshot,
} from './instrument-master.cache';
import {
  MOCK_INSTRUMENT_MASTER_PROVIDER,
  DHAN_INSTRUMENT_MASTER_PROVIDER,
  INSTRUMENT_REPOSITORY,
} from './instrument-master.constants';
import type { IInstrumentMasterProvider } from './interfaces/instrument-master-provider.interface';
import type {
  IInstrumentRepository,
  InstrumentSourceProvider,
} from './interfaces/instrument-repository.interface';
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
 * Owns PAPER/LIVE provider switching itself (Mock and Dhan providers are
 * both ordinary Nest singletons, injected directly) — mirrors
 * MarketDataService's pattern. Driven exclusively by TradingModeService;
 * does NOT depend on TradingModeService itself (that would be a circular
 * module dependency, since TradingModeModule depends on this module).
 */
@Injectable()
export class InstrumentMasterService implements OnModuleInit {
  private readonly logger = new Logger(InstrumentMasterService.name);
  private activeProviderType: InstrumentSourceProvider = 'MOCK';
  private lastLoadedSourceProvider: InstrumentSourceProvider | null = null;

  constructor(
    @Inject(MOCK_INSTRUMENT_MASTER_PROVIDER)
    private readonly mockProvider: IInstrumentMasterProvider,
    @Inject(DHAN_INSTRUMENT_MASTER_PROVIDER)
    private readonly dhanProvider: IInstrumentMasterProvider,
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
      this.lastLoadedSourceProvider = backup.sourceProvider;
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

  /**
   * Sets the initial active provider from the persisted trading mode,
   * before any switch has ever happened. Called once by TradingModeService's
   * OnApplicationBootstrap hook, which runs after this service's own
   * onModuleInit (so the restored backup's provenance is already known).
   */
  initializeForMode(mode: TradingMode): void {
    this.activeProviderType = this.typeForMode(mode);
  }

  /**
   * If the backup restored at boot came from the wrong provider for the
   * current mode (or predates this field entirely — null, treated as
   * unknown/stale), triggers an immediate refresh from the correct source
   * rather than trusting a possibly-wrong-source cache. Deliberately
   * fire-and-forget from the caller's perspective (network call, must never
   * delay the HTTP port opening) — callers should not await this inline
   * with process boot.
   */
  async refreshIfSourceMismatch(mode: TradingMode): Promise<void> {
    const expected = this.typeForMode(mode);
    if (this.lastLoadedSourceProvider === expected) {
      return;
    }
    // Defensive: correct the active pointer here too, regardless of
    // whether initializeForMode(mode) was already called for this mode —
    // refresh() always uses whatever the active provider currently is.
    this.activeProviderType = expected;
    await this.refresh().catch((error: unknown) => {
      this.logger.warn(
        `Instrument master provenance mismatch (expected ${expected}, had ${String(this.lastLoadedSourceProvider)}) and the corrective refresh failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    });
  }

  /** Runs once daily; also invoked directly for manual refresh. Always refreshes from the currently active provider. */
  @Cron('0 8 * * *')
  async refresh(): Promise<InstrumentCacheSnapshot> {
    this.eventBus.publish(new InstrumentMasterRefreshStartedEvent());

    try {
      const instruments = await this.activeProvider().fetchInstruments();
      if (instruments.length === 0) {
        throw new InstrumentMasterEmptyException(
          'Instrument master fetch returned zero instruments',
        );
      }

      const snapshot = this.cache.swap(instruments);
      await this.persistBackup(instruments, snapshot, this.activeProviderType);

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

  /**
   * Prepare phase of an atomic mode switch: fetches from the target
   * provider WITHOUT touching the cache — invisible to every consumer
   * until commitInstrumentSwitch runs.
   */
  async prepareRefreshForMode(mode: TradingMode): Promise<Instrument[]> {
    const targetType = this.typeForMode(mode);
    const instruments =
      await this.providerOfType(targetType).fetchInstruments();
    if (instruments.length === 0) {
      throw new InstrumentMasterEmptyException(
        'Instrument master fetch returned zero instruments',
      );
    }
    return instruments;
  }

  /** Commit phase: atomically swaps the cache and flips the active provider together. */
  async commitInstrumentSwitch(
    mode: TradingMode,
    instruments: Instrument[],
  ): Promise<void> {
    const targetType = this.typeForMode(mode);
    const snapshot = this.cache.swap(instruments);
    this.activeProviderType = targetType;
    this.lastLoadedSourceProvider = targetType;
    await this.persistBackup(instruments, snapshot, targetType);
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
    sourceProvider: InstrumentSourceProvider,
  ): Promise<void> {
    await this.repository
      .saveSnapshot(instruments, snapshot.version, sourceProvider)
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to persist instrument master backup: ${this.describeError(error)}`,
        );
      });
  }

  private typeForMode(mode: TradingMode): InstrumentSourceProvider {
    return mode === 'LIVE' ? 'DHAN' : 'MOCK';
  }

  private providerOfType(
    type: InstrumentSourceProvider,
  ): IInstrumentMasterProvider {
    return type === 'DHAN' ? this.dhanProvider : this.mockProvider;
  }

  private activeProvider(): IInstrumentMasterProvider {
    return this.providerOfType(this.activeProviderType);
  }

  private describeError(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Unknown instrument master error';
  }
}
