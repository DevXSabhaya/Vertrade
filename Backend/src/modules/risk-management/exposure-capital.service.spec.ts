import type { PositionManager } from '@modules/trade-lifecycle/position-manager.service';
import type { TradeRecord } from '@modules/trade-lifecycle/models/trade-record.model';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { ExposureCapitalService } from './exposure-capital.service';

function record(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    tradeId: 't1',
    signalId: null,
    brokerOrderId: null,
    brokerPositionId: null,
    instrument: 'RELIANCE-EQ',
    exchange: 'NSE',
    token: '2885',
    direction: TradeDirection.LONG,
    entryPrice: 100,
    quantity: 10,
    filledQuantity: 10,
    openQuantity: 10,
    exitedQuantity: 0,
    averagePrice: null,
    exitPrice: null,
    status: 'ACTIVE' as never,
    lifecycleStage: 'ACTIVE' as never,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    targets: [110],
    currentTarget: null,
    stopLoss: 95,
    currentStopLoss: 95,
    trailingEnabled: false,
    trailingConfiguration: null,
    riskReward: null,
    realizedPnl: null,
    unrealizedPnl: null,
    exitReason: null,
    brokerMetadata: {},
    positionDurationMs: 0,
    mode: 'PAPER',
    ...overrides,
  };
}

function positionManager(
  records: TradeRecord[],
): jest.Mocked<Pick<PositionManager, 'getActivePositions'>> {
  return { getActivePositions: jest.fn().mockResolvedValue(records) };
}

describe('ExposureCapitalService', () => {
  it('returns an empty array when there are no open positions', async () => {
    const service = new ExposureCapitalService(
      positionManager([]) as unknown as PositionManager,
    );
    expect(await service.getOpenPositionViews()).toEqual([]);
    expect(await service.getTotalExposure()).toBe(0);
    expect(await service.getUsedCapital()).toBe(0);
  });

  it('computes exposure as price × open quantity, using averagePrice when filled', async () => {
    const service = new ExposureCapitalService(
      positionManager([
        record({ averagePrice: 102, openQuantity: 10, quantity: 10 }),
      ]) as unknown as PositionManager,
    );
    const [view] = await service.getOpenPositionViews();
    expect(view.exposure).toBe(1_020);
    expect(view.capitalUsed).toBe(1_020);
  });

  it('falls back to entryPrice when averagePrice is not yet set', async () => {
    const service = new ExposureCapitalService(
      positionManager([
        record({
          averagePrice: null,
          entryPrice: 100,
          openQuantity: 5,
          quantity: 5,
        }),
      ]) as unknown as PositionManager,
    );
    const [view] = await service.getOpenPositionViews();
    expect(view.exposure).toBe(500);
  });

  it('falls back to quantity when openQuantity is 0', async () => {
    const service = new ExposureCapitalService(
      positionManager([
        record({ averagePrice: 100, openQuantity: 0, quantity: 20 }),
      ]) as unknown as PositionManager,
    );
    const [view] = await service.getOpenPositionViews();
    expect(view.quantity).toBe(20);
    expect(view.exposure).toBe(2_000);
  });

  it('sums exposure and capital across multiple positions', async () => {
    const service = new ExposureCapitalService(
      positionManager([
        record({
          token: '1',
          averagePrice: 100,
          openQuantity: 10,
          quantity: 10,
        }),
        record({
          token: '2',
          averagePrice: 50,
          openQuantity: 20,
          quantity: 20,
        }),
      ]) as unknown as PositionManager,
    );
    expect(await service.getTotalExposure()).toBe(2_000);
    expect(await service.getUsedCapital()).toBe(2_000);
  });

  it('preserves instrument token and direction on each view', async () => {
    const service = new ExposureCapitalService(
      positionManager([
        record({ token: 'TOKEN-9', direction: TradeDirection.SHORT }),
      ]) as unknown as PositionManager,
    );
    const [view] = await service.getOpenPositionViews();
    expect(view.instrumentToken).toBe('TOKEN-9');
    expect(view.direction).toBe(TradeDirection.SHORT);
  });
});
