import { Inject, Injectable, Logger } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { ConfigService } from '@core/config/config.service';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { BrokerAccountService } from '@modules/broker/broker-account/broker-account.service';
import { BusinessException } from '@common/exceptions/business.exception';
import { BrokerAccountNotFoundException } from '@modules/broker/broker-account/exceptions/broker-account-not-found.exception';
import type { TradingMode } from '@modules/trade-lifecycle/models/trade-record.model';
import { TradingModeChangedEvent } from './events/trading-mode-changed.event';
import { USER_TRADING_PREFERENCE_REPOSITORY } from './trading-mode.constants';
import type { IUserTradingPreferenceRepository } from './repository/user-trading-preference-repository.interface';
import type { UserTradingPreference } from './models/user-trading-preference.model';

/**
 * The single source of truth for "what trading mode is THIS USER in right
 * now" — per-user, never a single deployment-wide value. Each user
 * independently chooses Paper or Live and, when Live, which of their own
 * connected `BrokerAccount`s executes their trades
 * (`selectedBrokerAccountId`). Switching one user's mode or broker has zero
 * effect on any other user.
 *
 * `TRADING_MODE` (env) is consulted only as the bootstrap default for a
 * user who has never set a preference — `getCurrentMode` falls back to it
 * when no `UserTradingPreference` row exists yet.
 *
 * Mode switching is atomic per user: `setMode` validates (LIVE requires an
 * owned, real, currently-authenticatable broker account) and only then
 * persists. A per-user single-flight guard ensures concurrent `setMode`
 * calls for the same user never run two switch sequences at once — they
 * collapse onto one real switch. Different users' switches are always
 * fully independent.
 */
@Injectable()
export class TradingModeService {
  private readonly logger = new Logger(TradingModeService.name);
  private readonly pendingSwitch = new Map<string, Promise<TradingMode>>();

  constructor(
    @Inject(USER_TRADING_PREFERENCE_REPOSITORY)
    private readonly preferenceRepository: IUserTradingPreferenceRepository,
    private readonly configService: ConfigService,
    private readonly brokerSessionManager: BrokerSessionManager,
    private readonly brokerAccountService: BrokerAccountService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async getCurrentMode(userId: string): Promise<TradingMode> {
    const preference = await this.preferenceRepository.find(userId);
    return preference?.tradingMode ?? this.configService.tradingMode;
  }

  async getSelectedBrokerAccountId(userId: string): Promise<string | null> {
    const preference = await this.preferenceRepository.find(userId);
    return preference?.selectedBrokerAccountId ?? null;
  }

  async getPreference(userId: string): Promise<UserTradingPreference> {
    const preference = await this.preferenceRepository.find(userId);
    return (
      preference ?? {
        userId,
        tradingMode: this.configService.tradingMode,
        selectedBrokerAccountId: null,
        updatedAt: new Date(0),
      }
    );
  }

  /**
   * Switches this user's mode.
   * - `PAPER`: always allowed, clears `selectedBrokerAccountId`, tears down
   *   this user's live session (if any) for the account they were using.
   * - `LIVE`: requires `brokerAccountId` — an account this user actually
   *   owns, whose broker is implemented, and whose credentials pass a real
   *   authentication check right now (via `BrokerAccountService.reconnect`,
   *   the same real Dhan validation the Broker Manager UI already uses — no
   *   faked success). A user with zero saved broker accounts gets the exact
   *   "connect a broker first" rejection, never a silent fallback.
   */
  async setMode(
    userId: string,
    mode: TradingMode,
    changedBy: string,
    brokerAccountId?: string,
  ): Promise<TradingMode> {
    const pending = this.pendingSwitch.get(userId);
    if (pending) {
      return pending
        .catch(() => undefined)
        .then(() => this.setMode(userId, mode, changedBy, brokerAccountId));
    }

    const switchPromise = this.performSwitch(
      userId,
      mode,
      changedBy,
      brokerAccountId,
    );
    this.pendingSwitch.set(userId, switchPromise);
    try {
      return await switchPromise;
    } finally {
      this.pendingSwitch.delete(userId);
    }
  }

  /**
   * "Change Broker" — stays in LIVE, switches which of this user's own
   * accounts executes their trades, without touching mode or any other
   * user's state. Runs the same real validation as switching into LIVE.
   */
  async setSelectedBroker(
    userId: string,
    brokerAccountId: string,
    changedBy: string,
  ): Promise<UserTradingPreference> {
    const current = await this.getPreference(userId);
    if (current.tradingMode !== 'LIVE') {
      throw new BusinessException(
        'Switch to Live Trading before selecting a broker.',
      );
    }

    await this.assertLiveModeIsSafe(userId, brokerAccountId);

    const updated = await this.preferenceRepository.upsert(userId, {
      tradingMode: 'LIVE',
      selectedBrokerAccountId: brokerAccountId,
    });

    this.logger.log(
      `Live broker changed for user ${userId}: ${current.selectedBrokerAccountId ?? 'none'} -> ${brokerAccountId} (by ${changedBy})`,
    );
    this.eventBus.publish(
      new TradingModeChangedEvent(
        userId,
        'LIVE',
        'LIVE',
        changedBy,
        brokerAccountId,
      ),
    );
    return updated;
  }

  private async performSwitch(
    userId: string,
    mode: TradingMode,
    changedBy: string,
    brokerAccountId?: string,
  ): Promise<TradingMode> {
    const previous = await this.getPreference(userId);
    if (
      mode === previous.tradingMode &&
      (mode === 'PAPER' || brokerAccountId === previous.selectedBrokerAccountId)
    ) {
      return mode;
    }

    if (mode === 'LIVE') {
      await this.assertLiveModeIsSafe(userId, brokerAccountId);
    }

    await this.preferenceRepository.upsert(userId, {
      tradingMode: mode,
      selectedBrokerAccountId:
        mode === 'LIVE' ? (brokerAccountId as string) : null,
    });

    if (mode === 'PAPER' && previous.selectedBrokerAccountId) {
      this.brokerSessionManager.unloadSession(previous.selectedBrokerAccountId);
    }

    this.logger.log(
      `Trading mode changed for user ${userId}: ${previous.tradingMode} -> ${mode} (by ${changedBy})`,
    );
    this.eventBus.publish(
      new TradingModeChangedEvent(
        userId,
        mode,
        previous.tradingMode,
        changedBy,
        mode === 'LIVE' ? (brokerAccountId as string) : null,
      ),
    );
    return mode;
  }

  /**
   * LIVE requires: at least one owned broker account (a fast, specific
   * failure for the common "no broker connected yet" case, worded exactly
   * as the product spec requires), a specific account selected among them,
   * and that account's credentials passing a real authentication check
   * right now — reusing `BrokerAccountService.reconnect`, which only
   * re-authenticates when needed and always does a real broker API call
   * when it does, never a fabricated success.
   */
  private async assertLiveModeIsSafe(
    userId: string,
    brokerAccountId?: string,
  ): Promise<void> {
    const accounts = await this.brokerAccountService.listAccounts(userId);
    if (accounts.length === 0) {
      throw new BusinessException(
        'You need to connect a broker before enabling Live Trading.',
      );
    }

    if (!brokerAccountId) {
      throw new BusinessException(
        'Select a broker account to enable Live Trading.',
      );
    }

    const account = accounts.find((a) => a.accountId === brokerAccountId);
    if (!account) {
      throw new BrokerAccountNotFoundException(brokerAccountId);
    }

    try {
      await this.brokerAccountService.reconnect(userId, brokerAccountId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      throw new BusinessException(
        `Cannot switch to LIVE mode: broker authentication failed (${reason}).`,
      );
    }
  }
}
