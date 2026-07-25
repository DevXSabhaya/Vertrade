import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { TrailingStrategy } from '@modules/trade-lifecycle/models/trailing-strategy.enum';
import { PaperTradeOwnershipService } from './paper-trade-ownership.service';
import { PaperTradeStatus } from './models/paper-trade-status.enum';
import { PaperTradeNotFoundException } from './exceptions/paper-trade-not-found.exception';
import { InMemoryPaperTradeOwnershipRepository } from './testing/in-memory-ownership-repository';
import { FakeClock } from './testing/fake-clock';

function buildParams(
  overrides: Partial<Parameters<PaperTradeOwnershipService['create']>[0]> = {},
) {
  return {
    userId: 'user-1',
    idempotencyKey: 'paper:user-1:abc',
    queueItemId: 'queue-item-1',
    reservedAmount: 5_000,
    rawSymbol: 'RELIANCE',
    direction: TradeDirection.LONG,
    quantity: 10,
    entryTriggerPrice: 500,
    initialStopLoss: 490,
    ...overrides,
  };
}

describe('PaperTradeOwnershipService', () => {
  it('creates a PENDING ownership row', async () => {
    const service = new PaperTradeOwnershipService(
      new InMemoryPaperTradeOwnershipRepository(),
      new FakeClock(),
    );
    const ownership = await service.create(buildParams());
    expect(ownership.status).toBe(PaperTradeStatus.PENDING);
    expect(ownership.tradeId).toBeNull();
  });

  it('defaults isMarketOrder to false and trailingConfig to null when omitted', async () => {
    const service = new PaperTradeOwnershipService(
      new InMemoryPaperTradeOwnershipRepository(),
      new FakeClock(),
    );
    const ownership = await service.create(buildParams());
    expect(ownership.isMarketOrder).toBe(false);
    expect(ownership.trailingConfig).toBeNull();
  });

  it('persists an explicit isMarketOrder flag and trailingConfig', async () => {
    const service = new PaperTradeOwnershipService(
      new InMemoryPaperTradeOwnershipRepository(),
      new FakeClock(),
    );
    const trailingConfig = {
      strategy: TrailingStrategy.FIXED_POINTS,
      fixedPoints: 10,
    };
    const ownership = await service.create(
      buildParams({ isMarketOrder: true, trailingConfig }),
    );
    expect(ownership.isMarketOrder).toBe(true);
    expect(ownership.trailingConfig).toEqual(trailingConfig);
  });

  it('requireOwned returns the ownership row for its own user', async () => {
    const service = new PaperTradeOwnershipService(
      new InMemoryPaperTradeOwnershipRepository(),
      new FakeClock(),
    );
    const ownership = await service.create(buildParams({ userId: 'user-1' }));

    const result = await service.requireOwned(ownership.id, 'user-1');
    expect(result.id).toBe(ownership.id);
  });

  it('requireOwned throws PaperTradeNotFoundException when the trade belongs to a different user', async () => {
    const service = new PaperTradeOwnershipService(
      new InMemoryPaperTradeOwnershipRepository(),
      new FakeClock(),
    );
    const ownership = await service.create(buildParams({ userId: 'user-1' }));

    await expect(service.requireOwned(ownership.id, 'user-2')).rejects.toThrow(
      PaperTradeNotFoundException,
    );
  });

  it('requireOwned throws PaperTradeNotFoundException for a nonexistent id', async () => {
    const service = new PaperTradeOwnershipService(
      new InMemoryPaperTradeOwnershipRepository(),
      new FakeClock(),
    );
    await expect(
      service.requireOwned('does-not-exist', 'user-1'),
    ).rejects.toThrow(PaperTradeNotFoundException);
  });

  it('listByUser only returns rows for that user', async () => {
    const service = new PaperTradeOwnershipService(
      new InMemoryPaperTradeOwnershipRepository(),
      new FakeClock(),
    );
    await service.create(buildParams({ userId: 'user-1', queueItemId: 'q1' }));
    await service.create(buildParams({ userId: 'user-2', queueItemId: 'q2' }));

    const forUser1 = await service.listByUser('user-1');
    expect(forUser1).toHaveLength(1);
    expect(forUser1[0].userId).toBe('user-1');
  });

  it('markOpen transitions PENDING -> OPEN and attaches the tradeId', async () => {
    const service = new PaperTradeOwnershipService(
      new InMemoryPaperTradeOwnershipRepository(),
      new FakeClock(),
    );
    const ownership = await service.create(buildParams());

    await service.markOpen(ownership, 'trade-123');

    const updated = await service.requireOwned(ownership.id, 'user-1');
    expect(updated.status).toBe(PaperTradeStatus.OPEN);
    expect(updated.tradeId).toBe('trade-123');
  });

  it('markFailed transitions to FAILED with a reason', async () => {
    const service = new PaperTradeOwnershipService(
      new InMemoryPaperTradeOwnershipRepository(),
      new FakeClock(),
    );
    const ownership = await service.create(buildParams());

    await service.markFailed(ownership, 'broker rejected');

    const updated = await service.requireOwned(ownership.id, 'user-1');
    expect(updated.status).toBe(PaperTradeStatus.FAILED);
    expect(updated.failureReason).toBe('broker rejected');
  });

  it('countOpenForUser counts only PENDING/OPEN rows', async () => {
    const service = new PaperTradeOwnershipService(
      new InMemoryPaperTradeOwnershipRepository(),
      new FakeClock(),
    );
    await service.create(buildParams({ userId: 'user-1', queueItemId: 'q1' }));
    const closed = await service.create(
      buildParams({ userId: 'user-1', queueItemId: 'q2' }),
    );
    await service.markClosed(closed);

    expect(await service.countOpenForUser('user-1')).toBe(1);
  });
});
