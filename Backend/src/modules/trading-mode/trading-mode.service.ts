import { Inject, Injectable, Logger } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { ConfigService } from '@core/config/config.service';
import { SettingsService } from '@modules/settings/settings.service';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { BusinessException } from '@common/exceptions/business.exception';
import type { TradingMode } from '@modules/trade-lifecycle/models/trade-record.model';
import { TradingModeChangedEvent } from './events/trading-mode-changed.event';

/** SettingsService key — a single shared key, not per-user: this deployment has one live broker session/mode for the whole process, matching the rest of the broker architecture (SYSTEM_USER_ID). */
export const TRADING_MODE_SETTING_KEY = 'TRADING_MODE_OVERRIDE';

/**
 * The single source of truth for "what trading mode is this deployment in
 * right now" — `ConfigService.tradingMode` (the `TRADING_MODE` env var)
 * remains the boot-time *default*, consulted only when no persisted
 * override exists yet, never re-read after that. Persists through
 * `SettingsService` (existing Mongo-backed, in-memory-cached settings
 * store) rather than inventing a new collection/cache.
 *
 * Deliberately does NOT change which executor an in-flight trade uses —
 * `Trade.mode` is captured once at trade-creation time (see
 * `QueueWorker.buildCreateTradeParams`) and never re-evaluated; switching
 * this service's current mode only affects *new* trades from that point
 * on, and (via `LiveOrderSafetyGateService`) acts as an additional runtime
 * circuit breaker on any further live order placement.
 */
@Injectable()
export class TradingModeService {
  private readonly logger = new Logger(TradingModeService.name);

  constructor(
    private readonly settingsService: SettingsService,
    private readonly configService: ConfigService,
    private readonly brokerSessionManager: BrokerSessionManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  /** Synchronous — SettingsService's cache is loaded once at boot and kept current on every write, so this never blocks on a DB round trip. */
  getCurrentMode(): TradingMode {
    return (
      this.settingsService.get<TradingMode>(TRADING_MODE_SETTING_KEY) ??
      this.configService.tradingMode
    );
  }

  /**
   * Switches the deployment's current mode. Never falls back silently: a
   * failed LIVE-readiness check throws, leaving the mode exactly as it was
   * — the caller sees a clear error, and no trade created after a failed
   * switch attempt can be mistakenly tagged with a mode the deployment
   * isn't actually ready for.
   */
  async setMode(mode: TradingMode, changedBy: string): Promise<TradingMode> {
    const previousMode = this.getCurrentMode();
    if (mode === previousMode) {
      return mode;
    }

    if (mode === 'LIVE') {
      await this.assertLiveModeIsSafe();
    }

    await this.settingsService.set(TRADING_MODE_SETTING_KEY, mode, changedBy);
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
}
