import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { ConfigService } from '@core/config/config.service';
import { SettingsService } from '@modules/settings/settings.service';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { BrokerTokenRenewalScheduler } from '@modules/broker/broker-auth/broker-token-renewal.scheduler';
import { MarketDataService } from '@modules/market-data/market-data.service';
import { InstrumentMasterService } from '@modules/instrument-master/instrument-master.service';
import { BusinessException } from '@common/exceptions/business.exception';
import type { TradingMode } from '@modules/trade-lifecycle/models/trade-record.model';
import { TradingModeChangedEvent } from './events/trading-mode-changed.event';

/** SettingsService key — a single shared key, not per-user: this deployment has one live broker session/mode for the whole process, matching the rest of the broker architecture (SYSTEM_USER_ID). */
export const TRADING_MODE_SETTING_KEY = 'TRADING_MODE_OVERRIDE';

/**
 * The single source of truth for "what trading mode is this deployment in
 * right now", AND the single orchestrator of everything that must change
 * atomically when that mode switches: the broker session, the active
 * market-data provider, and the active instrument-master provider.
 *
 * `TRADING_MODE` (env) is consulted only as the bootstrap seed for the very
 * first boot ever — `onModuleInit` persists it into Settings exactly once
 * if no override exists yet, so a later change to the Render env var has no
 * effect on an already-bootstrapped deployment (runtime state always wins
 * over env after that point). `getCurrentMode()`'s `?? configService.tradingMode`
 * fallback only matters in the narrow window before that one-time bootstrap
 * write lands (or in a unit test that constructs this service without
 * calling `onModuleInit`); once persisted, Settings' cache always has a
 * value.
 *
 * Mode switching is atomic: `setMode` runs a prepare-then-commit sequence.
 * Prepare (broker session establishment for LIVE, connecting the target
 * market-data provider, fetching from the target instrument-master
 * provider) touches nothing externally visible — a failure at this stage
 * leaves mode, providers, and session exactly as they were. Commit (persist
 * mode, swap the instrument cache, flip the active market-data provider,
 * start/stop the token-renewal scheduler, tear down the broker session on a
 * switch to PAPER) is a tight synchronous sequence with no possibility of a
 * consumer observing a mix of old-mode and new-mode state. A single-flight
 * guard (`pendingSwitch`) ensures concurrent `setMode` calls never run two
 * prepare/commit sequences at once — they collapse onto one real switch.
 */
@Injectable()
export class TradingModeService
  implements OnModuleInit, OnApplicationBootstrap
{
  private readonly logger = new Logger(TradingModeService.name);
  private pendingSwitch: Promise<TradingMode> | null = null;

  constructor(
    private readonly settingsService: SettingsService,
    private readonly configService: ConfigService,
    private readonly brokerSessionManager: BrokerSessionManager,
    private readonly brokerTokenRenewalScheduler: BrokerTokenRenewalScheduler,
    private readonly marketDataService: MarketDataService,
    private readonly instrumentMasterService: InstrumentMasterService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  /** Bootstrap-once: seeds the persisted mode from TRADING_MODE only if nothing has ever been persisted. Never runs again after the first successful write. */
  async onModuleInit(): Promise<void> {
    if (this.settingsService.get(TRADING_MODE_SETTING_KEY) === undefined) {
      await this.settingsService.set(
        TRADING_MODE_SETTING_KEY,
        this.configService.tradingMode,
        'system:bootstrap',
      );
    }
  }

  /**
   * Runs once, after every module's onModuleInit has completed (Nest
   * guarantee) — restores runtime state after a restart/redeploy without
   * any operator action: corrects MarketDataService/InstrumentMasterService's
   * default (MOCK) active provider to match the persisted mode, triggers a
   * corrective instrument-master refresh if the restored backup came from
   * the wrong source, and — only for LIVE — authenticates completely before
   * NestFactory.create() resolves (main.ts awaits this before app.listen(),
   * so LIVE mode never accepts a connection while unauthenticated; slower
   * boot in LIVE mode is an accepted, deliberate tradeoff for that
   * guarantee). Never throws: a failed LIVE bootstrap leaves the deployment
   * in REAUTH_REQUIRED rather than crashing the process.
   */
  async onApplicationBootstrap(): Promise<void> {
    const mode = this.getCurrentMode();
    this.marketDataService.initializeForMode(mode);
    this.instrumentMasterService.initializeForMode(mode);
    this.instrumentMasterService
      .refreshIfSourceMismatch(mode)
      .catch(() => undefined);

    if (mode === 'LIVE') {
      try {
        await this.brokerSessionManager.bootstrapLiveSession();
      } catch (error) {
        // bootstrapLiveSession is documented to swallow its own failures —
        // this catch is defense-in-depth only: process boot must never
        // crash because of broker connectivity, full stop.
        this.logger.error(
          `Unexpected error during LIVE-mode broker bootstrap: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
      this.brokerTokenRenewalScheduler.start();
    }
  }

  /** Synchronous — SettingsService's cache is loaded once at boot and kept current on every write, so this never blocks on a DB round trip. */
  getCurrentMode(): TradingMode {
    return (
      this.settingsService.get<TradingMode>(TRADING_MODE_SETTING_KEY) ??
      this.configService.tradingMode
    );
  }

  /**
   * Switches the deployment's current mode via an atomic prepare/commit
   * sequence (see class docstring). A single-flight guard collapses
   * concurrent calls: identical-target calls share one real switch;
   * different-target calls run strictly after the in-flight one finishes
   * (never interleaved), regardless of whether that prior attempt
   * succeeded or failed.
   */
  async setMode(mode: TradingMode, changedBy: string): Promise<TradingMode> {
    if (this.pendingSwitch) {
      return this.pendingSwitch
        .catch(() => undefined)
        .then(() => this.setMode(mode, changedBy));
    }

    const previousMode = this.getCurrentMode();
    if (mode === previousMode) {
      return mode;
    }

    this.pendingSwitch = this.performSwitch(mode, previousMode, changedBy);
    try {
      return await this.pendingSwitch;
    } finally {
      this.pendingSwitch = null;
    }
  }

  private async performSwitch(
    mode: TradingMode,
    previousMode: TradingMode,
    changedBy: string,
  ): Promise<TradingMode> {
    // --- PREPARE: nothing externally visible changes yet ---
    if (mode === 'LIVE') {
      await this.assertLiveModeIsSafe();
    }

    await this.marketDataService.prepareProviderForMode(mode);

    let instruments;
    try {
      instruments =
        await this.instrumentMasterService.prepareRefreshForMode(mode);
    } catch (error) {
      await this.marketDataService
        .abortPreparedProvider(mode)
        .catch(() => undefined);
      throw this.wrapSwitchFailure(mode, error);
    }

    // --- COMMIT: tight synchronous sequence, mode/providers/session flip together ---
    await this.settingsService.set(TRADING_MODE_SETTING_KEY, mode, changedBy);
    await this.instrumentMasterService.commitInstrumentSwitch(
      mode,
      instruments,
    );
    await this.marketDataService.commitProviderSwitch(mode);

    if (mode === 'LIVE') {
      this.brokerTokenRenewalScheduler.start();
    } else {
      this.brokerTokenRenewalScheduler.stop();
      await this.brokerSessionManager.logout().catch(() => undefined);
    }

    this.logger.log(
      `Trading mode changed: ${previousMode} -> ${mode} (by ${changedBy})`,
    );
    this.eventBus.publish(
      new TradingModeChangedEvent(mode, previousMode, changedBy),
    );
    return mode;
  }

  /**
   * LIVE requires both real broker credentials configured for this
   * deployment (a fast, specific failure for the common "Paper-only
   * deployment" case) and a broker session `BrokerSessionManager` can
   * actually establish right now (the real safety check — credentials
   * that are present but wrong/expired/placeholder fail here instead of
   * only being discovered when the first live order is attempted).
   */
  private async assertLiveModeIsSafe(): Promise<void> {
    if (!this.configService.hasDhanCredentials) {
      throw new BusinessException(
        'Cannot switch to LIVE mode: no Dhan broker credentials are configured for this deployment.',
      );
    }

    try {
      await this.brokerSessionManager.ensureSession();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      throw new BusinessException(
        `Cannot switch to LIVE mode: broker authentication failed (${reason}).`,
      );
    }

    if (!this.brokerSessionManager.isSessionValid()) {
      throw new BusinessException(
        'Cannot switch to LIVE mode: broker session could not be established.',
      );
    }
  }

  private wrapSwitchFailure(
    mode: TradingMode,
    error: unknown,
  ): BusinessException {
    const reason = error instanceof Error ? error.message : 'unknown error';
    return new BusinessException(`Cannot switch to ${mode} mode: ${reason}.`);
  }
}
