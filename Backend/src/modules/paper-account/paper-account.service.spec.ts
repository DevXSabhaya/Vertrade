import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { ConfigService } from '@core/config/config.service';
import type { IPaperAccountRepository } from './interfaces/paper-account-repository.interface';
import type { PaperAccount } from './models/paper-account.model';
import { PaperAccountStatus } from './models/paper-account-status.enum';
import { PaperAccountService } from './paper-account.service';
import { PaperAccountNotFoundException } from './exceptions/paper-account-not-found.exception';
import { InsufficientPaperBalanceException } from './exceptions/insufficient-paper-balance.exception';
import { FakeClock } from './testing/fake-clock';

/** Faithfully replicates the atomic-guard semantics of the real Mongo repository, so these tests exercise real business behavior rather than a trivial mock. */
class InMemoryPaperAccountRepository implements IPaperAccountRepository {
  private accounts = new Map<string, PaperAccount>();

  createIfMissing(
    userId: string,
    initialBalance: number,
    now: string,
  ): Promise<PaperAccount> {
    const existing = this.accounts.get(userId);
    if (existing) {
      return Promise.resolve(existing);
    }
    const account: PaperAccount = {
      userId,
      initialBalance,
      availableBalance: initialBalance,
      reservedMargin: 0,
      realizedPnl: 0,
      status: PaperAccountStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
    };
    this.accounts.set(userId, account);
    return Promise.resolve(account);
  }

  findByUserId(userId: string): Promise<PaperAccount | null> {
    return Promise.resolve(this.accounts.get(userId) ?? null);
  }

  reserveMargin(
    userId: string,
    amount: number,
    now: string,
  ): Promise<PaperAccount | null> {
    const account = this.accounts.get(userId);
    if (
      !account ||
      account.status !== PaperAccountStatus.ACTIVE ||
      account.availableBalance < amount
    ) {
      return Promise.resolve(null);
    }
    const updated: PaperAccount = {
      ...account,
      availableBalance: account.availableBalance - amount,
      reservedMargin: account.reservedMargin + amount,
      updatedAt: now,
    };
    this.accounts.set(userId, updated);
    return Promise.resolve(updated);
  }

  releaseMargin(
    userId: string,
    amount: number,
    realizedPnlDelta: number,
    now: string,
  ): Promise<PaperAccount | null> {
    const account = this.accounts.get(userId);
    if (!account) {
      return Promise.resolve(null);
    }
    const updated: PaperAccount = {
      ...account,
      availableBalance: account.availableBalance + amount + realizedPnlDelta,
      reservedMargin: account.reservedMargin - amount,
      realizedPnl: account.realizedPnl + realizedPnlDelta,
      updatedAt: now,
    };
    this.accounts.set(userId, updated);
    return Promise.resolve(updated);
  }

  resetBalance(
    userId: string,
    initialBalance: number,
    now: string,
  ): Promise<PaperAccount | null> {
    const account = this.accounts.get(userId);
    if (!account) {
      return Promise.resolve(null);
    }
    const updated: PaperAccount = {
      ...account,
      initialBalance,
      availableBalance: initialBalance,
      reservedMargin: 0,
      realizedPnl: 0,
      updatedAt: now,
    };
    this.accounts.set(userId, updated);
    return Promise.resolve(updated);
  }

  setStatus(userId: string, status: PaperAccountStatus): void {
    const account = this.accounts.get(userId);
    if (account) {
      this.accounts.set(userId, { ...account, status });
    }
  }
}

function eventBus(): jest.Mocked<Pick<IEventBus, 'publish'>> {
  return { publish: jest.fn() };
}

function configService(initialBalance = 100_000): ConfigService {
  return {
    paperTradingInitialBalance: initialBalance,
  } as unknown as ConfigService;
}

describe('PaperAccountService', () => {
  it('createForUser creates the account with the configured initial balance and publishes the event', async () => {
    const bus = eventBus();
    const service = new PaperAccountService(
      new InMemoryPaperAccountRepository(),
      bus as unknown as IEventBus,
      new FakeClock(),
      configService(50_000),
    );

    const account = await service.createForUser('user-1');

    expect(account.availableBalance).toBe(50_000);
    expect(account.reservedMargin).toBe(0);
    expect(bus.publish).toHaveBeenCalledTimes(1);
  });

  it('createForUser is idempotent — a second call does not re-publish or reset the balance', async () => {
    const bus = eventBus();
    const service = new PaperAccountService(
      new InMemoryPaperAccountRepository(),
      bus as unknown as IEventBus,
      new FakeClock(),
      configService(),
    );

    await service.createForUser('user-1');
    await service.reserveMargin('user-1', 10_000);
    await service.createForUser('user-1');

    expect(bus.publish).toHaveBeenCalledTimes(1);
    const account = await service.getByUserId('user-1');
    expect(account.reservedMargin).toBe(10_000);
  });

  it('getByUserId throws when no account exists', async () => {
    const service = new PaperAccountService(
      new InMemoryPaperAccountRepository(),
      eventBus() as unknown as IEventBus,
      new FakeClock(),
      configService(),
    );
    await expect(service.getByUserId('missing')).rejects.toThrow(
      PaperAccountNotFoundException,
    );
  });

  it('getSummary computes equity as availableBalance + reservedMargin', async () => {
    const service = new PaperAccountService(
      new InMemoryPaperAccountRepository(),
      eventBus() as unknown as IEventBus,
      new FakeClock(),
      configService(100_000),
    );
    await service.createForUser('user-1');
    await service.reserveMargin('user-1', 15_000);

    const summary = await service.getSummary('user-1');

    expect(summary.availableBalance).toBe(85_000);
    expect(summary.reservedMargin).toBe(15_000);
    expect(summary.equity).toBe(100_000);
  });

  it('reserveMargin succeeds and moves funds from available to reserved', async () => {
    const service = new PaperAccountService(
      new InMemoryPaperAccountRepository(),
      eventBus() as unknown as IEventBus,
      new FakeClock(),
      configService(100_000),
    );
    await service.createForUser('user-1');

    const account = await service.reserveMargin('user-1', 20_000);

    expect(account.availableBalance).toBe(80_000);
    expect(account.reservedMargin).toBe(20_000);
  });

  it('reserveMargin throws InsufficientPaperBalanceException when the amount exceeds available balance', async () => {
    const service = new PaperAccountService(
      new InMemoryPaperAccountRepository(),
      eventBus() as unknown as IEventBus,
      new FakeClock(),
      configService(1_000),
    );
    await service.createForUser('user-1');

    await expect(service.reserveMargin('user-1', 5_000)).rejects.toThrow(
      InsufficientPaperBalanceException,
    );
  });

  it('reserveMargin throws for a DISABLED account even with sufficient balance', async () => {
    const repo = new InMemoryPaperAccountRepository();
    const service = new PaperAccountService(
      repo,
      eventBus() as unknown as IEventBus,
      new FakeClock(),
      configService(100_000),
    );
    await service.createForUser('user-1');
    repo.setStatus('user-1', PaperAccountStatus.DISABLED);

    await expect(service.reserveMargin('user-1', 1_000)).rejects.toThrow(
      InsufficientPaperBalanceException,
    );
  });

  it('rollbackReservation releases the reserved amount back to available balance', async () => {
    const service = new PaperAccountService(
      new InMemoryPaperAccountRepository(),
      eventBus() as unknown as IEventBus,
      new FakeClock(),
      configService(100_000),
    );
    await service.createForUser('user-1');
    await service.reserveMargin('user-1', 20_000);

    await service.rollbackReservation('user-1', 20_000);

    const account = await service.getByUserId('user-1');
    expect(account.availableBalance).toBe(100_000);
    expect(account.reservedMargin).toBe(0);
  });

  it('settleTrade releases margin and folds in a profit', async () => {
    const service = new PaperAccountService(
      new InMemoryPaperAccountRepository(),
      eventBus() as unknown as IEventBus,
      new FakeClock(),
      configService(100_000),
    );
    await service.createForUser('user-1');
    await service.reserveMargin('user-1', 20_000);

    await service.settleTrade('user-1', 20_000, 1_500);

    const account = await service.getByUserId('user-1');
    expect(account.availableBalance).toBe(101_500);
    expect(account.reservedMargin).toBe(0);
    expect(account.realizedPnl).toBe(1_500);
  });

  it('settleTrade folds in a loss correctly', async () => {
    const service = new PaperAccountService(
      new InMemoryPaperAccountRepository(),
      eventBus() as unknown as IEventBus,
      new FakeClock(),
      configService(100_000),
    );
    await service.createForUser('user-1');
    await service.reserveMargin('user-1', 20_000);

    await service.settleTrade('user-1', 20_000, -3_000);

    const account = await service.getByUserId('user-1');
    expect(account.availableBalance).toBe(97_000);
    expect(account.realizedPnl).toBe(-3_000);
  });

  it('resetBalance restores the configured initial balance and zeroes reserved/realized, publishing the event', async () => {
    const bus = eventBus();
    const service = new PaperAccountService(
      new InMemoryPaperAccountRepository(),
      bus as unknown as IEventBus,
      new FakeClock(),
      configService(100_000),
    );
    await service.createForUser('user-1');
    await service.reserveMargin('user-1', 20_000);
    await service.settleTrade('user-1', 20_000, 5_000);

    const reset = await service.resetBalance('user-1');

    expect(reset.availableBalance).toBe(100_000);
    expect(reset.reservedMargin).toBe(0);
    expect(reset.realizedPnl).toBe(0);
    expect(bus.publish).toHaveBeenCalledTimes(2); // created + reset
  });
});
