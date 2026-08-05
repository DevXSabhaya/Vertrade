import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { ConfigService } from '@core/config/config.service';
import { SettingsService } from '@modules/settings/settings.service';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { BrokerTokenRenewalScheduler } from '@modules/broker/broker-auth/broker-token-renewal.scheduler';
import { BusinessException } from '@common/exceptions/business.exception';
import type { TradingMode } from '@modules/trade-lifecycle/models/trade-record.model';
import { TradingModeChangedEvent } from './events/trading-mode-changed.event';
import { BrokerSessionExpiredException } from '@modules/broker/broker-auth/exceptions/broker-session-expired.exception';

/**
 * SettingsService key — a single shared key, not per-user: this deployment has one live broker session/mode for the whole process, matching the rest of the broker architecture (SYSTEM_USER_ID). */
export const TRADING_MODE_SETTING_KEY = 'TRADING_MODE_OVERRIDE';

/**
 * The single source of truth for "what trading mode is this deployment in
 * right now", AND the single orchestrator of everything that must change
 * when that mode switches — which, per Core Architecture Principle #4, is
 * ONLY order execution and the broker session that supports it. Market Data
 * and Instrument Master are never touched here: they are wired to a single
 * provider independent of trading mode (see MarketDataModule /
 * InstrumentMasterModule), so Paper and Live always observe identical prices
 * and instruments (Principle #5).
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
 * Mode switching is atomic: `setMode` persists the new mode and then
 * establishes/tears down the broker session used for LIVE order execution.
 * A single-flight guard (`pendingSwitch`) ensures concurrent `setMode` calls
 * never run two switch sequences at once — they collapse onto one real
 * switch.
 */
@Injectable()
export class TradingModeService implements OnModuleInit {
  private readonly logger = new Logger(TradingModeService.name);
  private pendingSwitch: Promise<TradingMode> | null = null;

  constructor(
    private readonly settingsService: SettingsService,
    private readonly configService: ConfigService,
    private readonly brokerSessionManager: BrokerSessionManager,
    private readonly brokerTokenRenewalScheduler: BrokerTokenRenewalScheduler,
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

    if (this.getCurrentMode() === 'LIVE') {
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
   * Switches which executor new orders route through. A single-flight guard
   * collapses concurrent calls: identical-target calls share one real
   * switch; different-target calls run strictly after the in-flight one
   * finishes (never interleaved), regardless of whether that prior attempt
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
    if (mode === 'LIVE') {
      await this.assertLiveModeIsSafe();
    }

    await this.settingsService.set(TRADING_MODE_SETTING_KEY, mode, changedBy);

    if (mode === 'LIVE') {
      this.brokerTokenRenewalScheduler.start();
    } else {
      this.brokerTokenRenewalScheduler.stop();
      this.brokerSessionManager.unloadSession();
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
      if (error instanceof BrokerSessionExpiredException) {
        // Do not throw! Let the switch complete so the user enters LIVE mode, but the status is REAUTH_REQUIRED.
        return;
      }
      const reason = error instanceof Error ? error.message : 'unknown error';
      throw new BusinessException(
        `Cannot switch to LIVE mode: broker authentication failed (${reason}).`,
      );
    }
  }
}
