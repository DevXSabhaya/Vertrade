import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { OrderQueueService } from '@modules/order-queue/order-queue.service';
import type { TradeManager } from '@modules/trade-lifecycle/trade-manager.service';
import type { TradeRecord } from '@modules/trade-lifecycle/models/trade-record.model';
import type { PaperAccountService } from '@modules/paper-account/paper-account.service';
import { InsufficientPaperBalanceException } from '@modules/paper-account/exceptions/insufficient-paper-balance.exception';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { ValidationFailureCode } from '@modules/trade-validation/models/validation-failure-code.enum';
import { PaperTradingService } from './paper-trading.service';
import { PaperTradeOwnershipService } from './paper-trade-ownership.service';
import { PaperTradeStatus } from './models/paper-trade-status.enum';
import { PaperTradeSubmissionRejectedException } from './exceptions/paper-trade-submission-rejected.exception';
import { PaperTradeNotActionableException } from './exceptions/paper-trade-not-actionable.exception';
import { PaperTradeNotFoundException } from './exceptions/paper-trade-not-found.exception';
import { InMemoryPaperTradeOwnershipRepository } from './testing/in-memory-ownership-repository';
import { FakeClock } from './testing/fake-clock';
import type { CreatePaperTradeDto } from './dto/create-paper-trade.dto';

function dto(
  overrides: Partial<CreatePaperTradeDto> = {},
): CreatePaperTradeDto {
  return {
    rawSymbol: 'RELIANCE',
    direction: TradeDirection.LONG,
    quantity: 10,
    entryTriggerPrice: 500,
    initialStopLoss: 490,
    targets: [520],
    ...overrides,
  };
}

function eventBus(): jest.Mocked<Pick<IEventBus, 'publish'>> {
  return { publish: jest.fn() };
}

function paperAccountService(
  overrides: Partial<
    Record<'reserveMargin' | 'rollbackReservation', jest.Mock>
  > = {},
): jest.Mocked<
  Pick<
    PaperAccountService,
    'reserveMargin' | 'rollbackReservation' | 'getSummary'
  >
> {
  return {
    reserveMargin: overrides.reserveMargin ?? jest.fn().mockResolvedValue({}),
    rollbackReservation:
      overrides.rollbackReservation ?? jest.fn().mockResolvedValue(undefined),
    getSummary: jest.fn().mockResolvedValue({
      userId: 'user-1',
      initialBalance: 100_000,
      availableBalance: 95_000,
      reservedMargin: 5_000,
      realizedPnl: 0,
      status: 'ACTIVE',
      createdAt: '',
      updatedAt: '',
      equity: 100_000,
    }),
  };
}

function buildService(options: {
  submitTradeResult?: unknown;
  paperAccount?: ReturnType<typeof paperAccountService>;
  tradeManager?: Partial<Record<'manualExit' | 'getTrade', jest.Mock>>;
}) {
  const ownershipRepo = new InMemoryPaperTradeOwnershipRepository();
  const ownershipService = new PaperTradeOwnershipService(
    ownershipRepo,
    new FakeClock(),
  );
  const orderQueueService = {
    submitTrade: jest.fn().mockResolvedValue(
      options.submitTradeResult ?? {
        outcome: 'QUEUED',
        item: { id: 'queue-item-1', idempotencyKey: 'paper:user-1:abc' },
      },
    ),
    cancel: jest.fn().mockResolvedValue(undefined),
    getItem: jest.fn(),
  } as unknown as jest.Mocked<OrderQueueService>;
  const tradeManager = {
    manualExit: options.tradeManager?.manualExit ?? jest.fn(),
    getTrade:
      options.tradeManager?.getTrade ??
      jest.fn().mockResolvedValue({ tradeId: 'trade-1', realizedPnl: 0 }),
  } as unknown as jest.Mocked<TradeManager>;
  const paperAccount = options.paperAccount ?? paperAccountService();
  const bus = eventBus();

  const service = new PaperTradingService(
    orderQueueService,
    tradeManager,
    ownershipService,
    paperAccount as unknown as PaperAccountService,
    bus as unknown as IEventBus,
  );

  return {
    service,
    orderQueueService,
    tradeManager,
    paperAccount,
    bus,
    ownershipService,
  };
}

describe('PaperTradingService', () => {
  describe('createTrade', () => {
    it('reserves margin, submits the trade, and creates a PENDING ownership row', async () => {
      const { service, orderQueueService, paperAccount, bus } = buildService(
        {},
      );

      const view = await service.createTrade('user-1', dto());

      expect(paperAccount.reserveMargin).toHaveBeenCalledWith('user-1', 5_000);
      expect(orderQueueService.submitTrade).toHaveBeenCalledWith(
        expect.objectContaining({ rawSymbol: 'RELIANCE' }),
        'user-1',
      );
      expect(view.status).toBe(PaperTradeStatus.PENDING);
      expect(bus.publish).toHaveBeenCalledTimes(1);
    });

    it('defaults liveTradingConfirmed to false in metadata when omitted', async () => {
      const { service, orderQueueService } = buildService({});

      await service.createTrade('user-1', dto());

      expect(orderQueueService.submitTrade).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ liveTradingConfirmed: false }),
        }),
        'user-1',
      );
    });

    it('threads an explicit liveTradingConfirmed: true through into metadata — this is the only way AngelOneExecutor will ever place a real entry order (LiveOrderSafetyGateService requires it in addition to the LIVE_TRADING_ENABLED flag and a healthy broker)', async () => {
      const { service, orderQueueService } = buildService({});

      await service.createTrade('user-1', dto({ liveTradingConfirmed: true }));

      expect(orderQueueService.submitTrade).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ liveTradingConfirmed: true }),
        }),
        'user-1',
      );
    });

    it('never calls submitTrade when the account has insufficient balance', async () => {
      const paperAccount = paperAccountService({
        reserveMargin: jest
          .fn()
          .mockRejectedValue(
            new InsufficientPaperBalanceException('insufficient'),
          ),
      });
      const { service, orderQueueService } = buildService({ paperAccount });

      await expect(service.createTrade('user-1', dto())).rejects.toThrow(
        InsufficientPaperBalanceException,
      );
      expect(orderQueueService.submitTrade).not.toHaveBeenCalled();
    });

    it('rolls back the reservation and throws on VALIDATION_FAILED, creating no ownership row', async () => {
      const { service, paperAccount, ownershipService } = buildService({
        submitTradeResult: {
          outcome: 'VALIDATION_FAILED',
          failure: {
            code: ValidationFailureCode.INSTRUMENT_NOT_FOUND,
            reason: ValidationFailureCode.INSTRUMENT_NOT_FOUND,
            message: 'Instrument not found',
            failedRule: 'InstrumentExistsRule',
            timestamp: new Date().toISOString(),
          },
        },
      });

      await expect(service.createTrade('user-1', dto())).rejects.toThrow(
        PaperTradeSubmissionRejectedException,
      );
      expect(paperAccount.rollbackReservation).toHaveBeenCalledWith(
        'user-1',
        5_000,
      );
      expect(await ownershipService.listByUser('user-1')).toHaveLength(0);
    });

    it('rolls back the reservation and throws on QUEUE_FULL', async () => {
      const { service, paperAccount } = buildService({
        submitTradeResult: { outcome: 'QUEUE_FULL' },
      });

      await expect(service.createTrade('user-1', dto())).rejects.toThrow(
        PaperTradeSubmissionRejectedException,
      );
      expect(paperAccount.rollbackReservation).toHaveBeenCalledWith(
        'user-1',
        5_000,
      );
    });

    it('rolls back the reservation and throws on REJECTED_KILL_SWITCH', async () => {
      const { service, paperAccount } = buildService({
        submitTradeResult: { outcome: 'REJECTED_KILL_SWITCH' },
      });

      await expect(service.createTrade('user-1', dto())).rejects.toThrow(
        PaperTradeSubmissionRejectedException,
      );
      expect(paperAccount.rollbackReservation).toHaveBeenCalledWith(
        'user-1',
        5_000,
      );
    });
  });

  describe('exitTrade', () => {
    it('throws PaperTradeNotActionableException when the trade is still PENDING', async () => {
      const { service } = buildService({});
      const created = await service.createTrade('user-1', dto());

      await expect(service.exitTrade('user-1', created.id)).rejects.toThrow(
        PaperTradeNotActionableException,
      );
    });

    it('exits an OPEN trade via TradeManager.manualExit', async () => {
      const record = {
        tradeId: 'trade-1',
        realizedPnl: 100,
      } as unknown as TradeRecord;
      const { service, tradeManager, ownershipService } = buildService({
        tradeManager: { manualExit: jest.fn().mockResolvedValue(record) },
      });
      const created = await service.createTrade('user-1', dto());
      const ownership = await ownershipService.requireOwned(
        created.id,
        'user-1',
      );
      await ownershipService.markOpen(ownership, 'trade-1');

      const result = await service.exitTrade('user-1', created.id);

      expect(tradeManager.manualExit).toHaveBeenCalledWith('trade-1');
      expect(result.trade).toBe(record);
    });

    it('never exposes a trade belonging to another user', async () => {
      const { service, ownershipService } = buildService({});
      const created = await service.createTrade('user-1', dto());
      const ownership = await ownershipService.requireOwned(
        created.id,
        'user-1',
      );
      await ownershipService.markOpen(ownership, 'trade-1');

      await expect(service.exitTrade('user-2', created.id)).rejects.toThrow(
        PaperTradeNotFoundException,
      );
    });
  });

  describe('cancelTrade', () => {
    it('cancels a PENDING trade and rolls back the reservation', async () => {
      const { service, orderQueueService, paperAccount } = buildService({});
      const created = await service.createTrade('user-1', dto());

      const result = await service.cancelTrade('user-1', created.id);

      expect(orderQueueService.cancel).toHaveBeenCalledWith(
        'paper:user-1:abc',
        'Cancelled by user',
      );
      expect(paperAccount.rollbackReservation).toHaveBeenCalledWith(
        'user-1',
        5_000,
      );
      expect(result.status).toBe(PaperTradeStatus.CANCELLED);
    });

    it('throws PaperTradeNotActionableException when the trade is already OPEN', async () => {
      const { service, ownershipService } = buildService({});
      const created = await service.createTrade('user-1', dto());
      const ownership = await ownershipService.requireOwned(
        created.id,
        'user-1',
      );
      await ownershipService.markOpen(ownership, 'trade-1');

      await expect(service.cancelTrade('user-1', created.id)).rejects.toThrow(
        PaperTradeNotActionableException,
      );
    });

    it('surfaces a cancel failure from OrderQueueService as PaperTradeNotActionableException', async () => {
      const { service, orderQueueService } = buildService({});
      (orderQueueService.cancel as jest.Mock).mockRejectedValue(
        new Error('item already terminal'),
      );
      const created = await service.createTrade('user-1', dto());

      await expect(service.cancelTrade('user-1', created.id)).rejects.toThrow(
        PaperTradeNotActionableException,
      );
    });
  });

  describe('user isolation', () => {
    it('getTrade throws for another user id', async () => {
      const { service } = buildService({});
      const created = await service.createTrade('user-1', dto());

      await expect(service.getTrade('user-2', created.id)).rejects.toThrow(
        PaperTradeNotFoundException,
      );
    });

    it("getActiveTrades only returns the requesting user's open trades", async () => {
      const { service, ownershipService } = buildService({});
      const created1 = await service.createTrade('user-1', dto());
      await service.createTrade('user-2', dto());
      const ownership1 = await ownershipService.requireOwned(
        created1.id,
        'user-1',
      );
      await ownershipService.markOpen(ownership1, 'trade-1');

      const user1Active = await service.getActiveTrades('user-1');
      const user2Active = await service.getActiveTrades('user-2');

      expect(user1Active).toHaveLength(1);
      expect(user2Active).toHaveLength(0);
    });
  });

  describe('hasOpenTrades', () => {
    it('is false with no trades and true once one is PENDING', async () => {
      const { service } = buildService({});
      expect(await service.hasOpenTrades('user-1')).toBe(false);

      await service.createTrade('user-1', dto());
      expect(await service.hasOpenTrades('user-1')).toBe(true);
    });
  });
});
