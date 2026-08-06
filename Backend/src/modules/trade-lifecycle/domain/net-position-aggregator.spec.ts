import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { aggregateNetPositions } from './net-position-aggregator';
import type { TradeRecord } from '../models/trade-record.model';

const ZERO_CHARGES = {
  brokerage: 0,
  stt: 0,
  exchangeCharges: 0,
  gst: 0,
  stampDuty: 0,
  sebiCharges: 0,
  total: 0,
};

function record(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    tradeId: 't1',
    signalId: null,
    brokerOrderId: null,
    brokerPositionId: null,
    instrument: 'NIFTY24500CE',
    exchange: 'NFO',
    token: 'TOKEN-1',
    direction: TradeDirection.LONG,
    entryPrice: 100,
    quantity: 50,
    filledQuantity: 50,
    openQuantity: 50,
    exitedQuantity: 0,
    averagePrice: 100,
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
    charges: ZERO_CHARGES,
    netPnl: null,
    exitReason: null,
    brokerMetadata: {},
    positionDurationMs: 0,
    mode: 'PAPER',
    ...overrides,
  };
}

describe('aggregateNetPositions', () => {
  it('returns an empty array when there are no open records', () => {
    expect(aggregateNetPositions([])).toEqual([]);
  });

  it('excludes records with zero open quantity (fully exited/pending)', () => {
    expect(aggregateNetPositions([record({ openQuantity: 0 })])).toEqual([]);
  });

  it('returns one position for a single open trade, carrying its own figures through', () => {
    const [position] = aggregateNetPositions([
      record({
        openQuantity: 50,
        averagePrice: 100,
        unrealizedPnl: 500,
        netPnl: 480,
      }),
    ]);
    expect(position).toMatchObject({
      instrumentToken: 'TOKEN-1',
      direction: TradeDirection.LONG,
      netQuantity: 50,
      averagePrice: 100,
      totalUnrealizedPnl: 500,
      netPnl: 480,
      lotCount: 1,
    });
  });

  it('combines two same-direction lots into a volume-weighted average price', () => {
    const [position] = aggregateNetPositions([
      record({ tradeId: 't1', openQuantity: 50, averagePrice: 100 }),
      record({ tradeId: 't2', openQuantity: 50, averagePrice: 120 }),
    ]);
    expect(position.netQuantity).toBe(100);
    expect(position.averagePrice).toBe(110); // (50*100 + 50*120) / 100
    expect(position.lotCount).toBe(2);
    expect([...position.tradeIds].sort()).toEqual(['t1', 't2']);
  });

  it('nets opposite-direction lots on the same instrument against each other', () => {
    const [position] = aggregateNetPositions([
      record({
        tradeId: 't1',
        direction: TradeDirection.LONG,
        openQuantity: 100,
        averagePrice: 100,
      }),
      record({
        tradeId: 't2',
        direction: TradeDirection.SHORT,
        openQuantity: 40,
        averagePrice: 110,
      }),
    ]);
    expect(position.direction).toBe(TradeDirection.LONG);
    expect(position.netQuantity).toBe(60); // 100 long - 40 short
  });

  it('omits a position entirely when opposite-direction lots exactly cancel out', () => {
    const positions = aggregateNetPositions([
      record({
        tradeId: 't1',
        direction: TradeDirection.LONG,
        openQuantity: 50,
      }),
      record({
        tradeId: 't2',
        direction: TradeDirection.SHORT,
        openQuantity: 50,
      }),
    ]);
    expect(positions).toEqual([]);
  });

  it('keeps different instruments as separate positions', () => {
    const positions = aggregateNetPositions([
      record({ tradeId: 't1', token: 'TOKEN-1' }),
      record({ tradeId: 't2', token: 'TOKEN-2' }),
    ]);
    expect(positions).toHaveLength(2);
    expect(positions.map((p) => p.instrumentToken).sort()).toEqual([
      'TOKEN-1',
      'TOKEN-2',
    ]);
  });

  it('sums realizedPnl, charges, and netPnl across every contributing lot', () => {
    const [position] = aggregateNetPositions([
      record({
        tradeId: 't1',
        openQuantity: 50,
        realizedPnl: 100,
        charges: { ...ZERO_CHARGES, total: 10 },
        netPnl: 90,
      }),
      record({
        tradeId: 't2',
        openQuantity: 50,
        realizedPnl: 50,
        charges: { ...ZERO_CHARGES, total: 5 },
        netPnl: 45,
      }),
    ]);
    expect(position.totalRealizedPnl).toBe(150);
    expect(position.totalCharges).toBe(15);
    expect(position.netPnl).toBe(135);
  });

  it('falls back to entryPrice for the average-price calc when averagePrice is not yet set', () => {
    const [position] = aggregateNetPositions([
      record({ averagePrice: null, entryPrice: 105, openQuantity: 50 }),
    ]);
    expect(position.averagePrice).toBe(105);
  });
});
