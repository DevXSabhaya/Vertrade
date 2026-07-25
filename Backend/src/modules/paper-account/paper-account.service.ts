import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { ConfigService } from '@core/config/config.service';
import { PAPER_ACCOUNT_REPOSITORY } from './paper-account.constants';
import type { IPaperAccountRepository } from './interfaces/paper-account-repository.interface';
import type {
  PaperAccount,
  PaperAccountSummary,
} from './models/paper-account.model';
import { PaperAccountCreatedEvent } from './events/paper-account-created.event';
import { PaperAccountResetEvent } from './events/paper-account-reset.event';
import { PaperAccountNotFoundException } from './exceptions/paper-account-not-found.exception';
import { InsufficientPaperBalanceException } from './exceptions/insufficient-paper-balance.exception';

/**
 * The only writer of paper-account balance figures (Phase 12, Part 3) —
 * every mutation goes through a single-document atomic Mongo update (see
 * `PaperAccountRepository`), so concurrent trades on the same account can
 * never over-reserve margin or race each other into an inconsistent state.
 * `equity` deliberately excludes unrealized P&L on open positions (that
 * requires reading the trading engine, which this module has no dependency
 * on) — `PaperTradingModule` composes the fuller picture for `/paper/pnl`.
 */
@Injectable()
export class PaperAccountService {
  constructor(
    @Inject(PAPER_ACCOUNT_REPOSITORY)
    private readonly repository: IPaperAccountRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly configService: ConfigService,
  ) {}

  /** Idempotent — safe to call multiple times (e.g. re-delivered `UserRegisteredEvent`); only the first call actually creates the account and publishes the event. */
  async createForUser(userId: string): Promise<PaperAccount> {
    const existing = await this.repository.findByUserId(userId);
    if (existing) {
      return existing;
    }
    const initialBalance = this.configService.paperTradingInitialBalance;
    const account = await this.repository.createIfMissing(
      userId,
      initialBalance,
      this.clock.now().toISOString(),
    );
    this.eventBus.publish(new PaperAccountCreatedEvent(userId, initialBalance));
    return account;
  }

  async getByUserId(userId: string): Promise<PaperAccount> {
    const account = await this.repository.findByUserId(userId);
    if (!account) {
      throw new PaperAccountNotFoundException(
        `No paper trading account found for user ${userId}`,
      );
    }
    return account;
  }

  async getSummary(userId: string): Promise<PaperAccountSummary> {
    const account = await this.getByUserId(userId);
    return {
      ...account,
      equity: account.availableBalance + account.reservedMargin,
    };
  }

  /** Throws {@link InsufficientPaperBalanceException} if the account is missing, `DISABLED`, or `availableBalance` is below `amount`. */
  async reserveMargin(userId: string, amount: number): Promise<PaperAccount> {
    const account = await this.repository.reserveMargin(
      userId,
      amount,
      this.clock.now().toISOString(),
    );
    if (!account) {
      throw new InsufficientPaperBalanceException(
        `Insufficient available balance to reserve ₹${amount}`,
      );
    }
    return account;
  }

  /** Used when a reservation must be undone — validation/risk rejection, queue failure, or order cancellation. Never throws: releasing back to an account that exists always succeeds. */
  async rollbackReservation(userId: string, amount: number): Promise<void> {
    await this.repository.releaseMargin(
      userId,
      amount,
      0,
      this.clock.now().toISOString(),
    );
  }

  /** Called once a paper trade reaches its final, realized outcome — releases the reserved margin back to available balance and folds in the realized P&L. */
  async settleTrade(
    userId: string,
    reservedAmount: number,
    realizedPnl: number,
  ): Promise<void> {
    await this.repository.releaseMargin(
      userId,
      reservedAmount,
      realizedPnl,
      this.clock.now().toISOString(),
    );
  }

  /** Balance-only reset — never touches trade/order/audit history (Phase 12, Part 10). Callers are responsible for verifying no open trades exist first. */
  async resetBalance(userId: string): Promise<PaperAccount> {
    const initialBalance = this.configService.paperTradingInitialBalance;
    const account = await this.repository.resetBalance(
      userId,
      initialBalance,
      this.clock.now().toISOString(),
    );
    if (!account) {
      throw new PaperAccountNotFoundException(
        `No paper trading account found for user ${userId}`,
      );
    }
    this.eventBus.publish(new PaperAccountResetEvent(userId, initialBalance));
    return account;
  }
}
