import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import type { TradeSnapshot } from '@modules/trading-engine/domain/trade-snapshot';
import { composeTradeRecord } from './trade-record-composer';
import { defaultTradeExtension } from '../models/trade-extension.model';
import { TradeLifecycleStage } from '../models/trade-lifecycle-stage.enum';

function snapshot(overrides: Partial<TradeSnapshot> = {}): TradeSnapshot {
  return {
    id: 't1',
    direction: TradeDirection.LONG,
    state: TradeState.ACTIVE,
    exchange: 'NFO',
    tradingSymbol: 'NIFTY24500CE',
    instrumentToken: 'TOKEN-1',
    quantity: 50,
    entryTriggerPrice: 100,
    initialStopLoss: 95,
    currentStopLoss: 100,
    targets: [110, 120, 135, 150],
    mode: 'PAPER',
    brokerAccountId: null,
    remainingTargets: [120, 135, 150],
    entryOrderId: 'E-1',
    entryOrderLifecycle: null,
    entryFillPrice: 100,
    filledQuantity: 50,
    exitOrderId: null,
    exitOrderLifecycle: null,
    exitedQuantity: 0,
    exitProceeds: 0,
    openQuantity: 50,
    exitPrice: null,
    realizedPnl: null,
    isAwaitingExit: false,
    metadata: { signalId: 'signal-42' },
    history: [],
    createdAt: new Date(1_700_000_000_000).toISOString(),
    updatedAt: new Date(1_700_000_000_000).toISOString(),
    ...overrides,
  };
}

describe('composeTradeRecord', () => {
  it('maps every TradeSnapshot field into the composed TradeRecord', () => {
    const record = composeTradeRecord(
      snapshot(),
      defaultTradeExtension('t1', new Date(1_700_000_000_000).toISOString()),
      110,
      1_700_000_010_000,
    );

    expect(record.tradeId).toBe('t1');
    expect(record.instrument).toBe('NIFTY24500CE');
    expect(record.exchange).toBe('NFO');
    expect(record.token).toBe('TOKEN-1');
    expect(record.brokerOrderId).toBe('E-1');
    expect(record.entryPrice).toBe(100);
    expect(record.quantity).toBe(50);
    expect(record.averagePrice).toBe(100);
    expect(record.status).toBe(TradeState.ACTIVE);
    expect(record.lifecycleStage).toBe(TradeLifecycleStage.TARGET1_HIT);
  });

  it('reads signalId from Trade metadata when present', () => {
    const record = composeTradeRecord(
      snapshot(),
      defaultTradeExtension('t1', new Date().toISOString()),
      null,
      1_700_000_010_000,
    );
    expect(record.signalId).toBe('signal-42');
  });

  it('reports null signalId when metadata carries no signalId', () => {
    const record = composeTradeRecord(
      snapshot({ metadata: {} }),
      defaultTradeExtension('t1', new Date().toISOString()),
      null,
      1_700_000_010_000,
    );
    expect(record.signalId).toBeNull();
  });

  it('computes unrealizedPnl from the supplied mark price', () => {
    const record = composeTradeRecord(
      snapshot(),
      defaultTradeExtension('t1', new Date().toISOString()),
      110,
      1_700_000_010_000,
    );
    expect(record.unrealizedPnl).toBe(500);
  });

  it('reports null unrealizedPnl when no mark price has been observed yet', () => {
    const record = composeTradeRecord(
      snapshot(),
      defaultTradeExtension('t1', new Date().toISOString()),
      null,
      1_700_000_010_000,
    );
    expect(record.unrealizedPnl).toBeNull();
  });

  it('carries the extension fields through unchanged', () => {
    const extension = {
      ...defaultTradeExtension('t1', new Date().toISOString()),
      brokerPositionId: 'POS-1',
      trailingEnabled: true,
    };
    const record = composeTradeRecord(
      snapshot(),
      extension,
      null,
      1_700_000_010_000,
    );
    expect(record.brokerPositionId).toBe('POS-1');
    expect(record.trailingEnabled).toBe(true);
  });

  it('computes positionDurationMs from createdAt to the supplied now', () => {
    const record = composeTradeRecord(
      snapshot({ createdAt: new Date(1_700_000_000_000).toISOString() }),
      defaultTradeExtension('t1', new Date().toISOString()),
      null,
      1_700_000_005_000,
    );
    expect(record.positionDurationMs).toBe(5000);
  });

  it('computes currentTarget as the index of the last target hit', () => {
    const record = composeTradeRecord(
      snapshot({ remainingTargets: [135, 150] }), // 2 of 4 hit
      defaultTradeExtension('t1', new Date().toISOString()),
      null,
      1_700_000_010_000,
    );
    expect(record.currentTarget).toBe(2);
  });

  it('reports currentTarget as null when no target has been hit yet', () => {
    const record = composeTradeRecord(
      snapshot({ remainingTargets: [110, 120, 135, 150] }),
      defaultTradeExtension('t1', new Date().toISOString()),
      null,
      1_700_000_010_000,
    );
    expect(record.currentTarget).toBeNull();
  });

  it('computes riskReward from entry/SL/first-target', () => {
    const record = composeTradeRecord(
      snapshot(),
      defaultTradeExtension('t1', new Date().toISOString()),
      null,
      1_700_000_010_000,
    );
    // risk = 100-95 = 5, reward = 110-100 = 10 -> 2
    expect(record.riskReward).toBe(2);
  });

  describe('charges / netPnl', () => {
    it('computes entry-side-only charges for a still-open trade (no exit yet)', () => {
      const record = composeTradeRecord(
        snapshot(),
        defaultTradeExtension('t1', new Date().toISOString()),
        110,
        1_700_000_010_000,
      );
      expect(record.charges.total).toBeGreaterThan(0);
      expect(record.charges.stt).toBe(0); // sell-side only; this LONG hasn't exited.
    });

    it('reports netPnl as null for a trade with no fills yet', () => {
      const record = composeTradeRecord(
        snapshot({ entryFillPrice: null, filledQuantity: 0, openQuantity: 0 }),
        defaultTradeExtension('t1', new Date().toISOString()),
        null,
        1_700_000_010_000,
      );
      expect(record.netPnl).toBeNull();
      expect(record.charges.total).toBe(0);
    });

    it('computes netPnl as unrealizedPnl minus charges for an open, filled trade', () => {
      const record = composeTradeRecord(
        snapshot(),
        defaultTradeExtension('t1', new Date().toISOString()),
        110,
        1_700_000_010_000,
      );
      // unrealizedPnl = (110 - 100) * 50 = 500
      expect(record.unrealizedPnl).toBe(500);
      expect(record.netPnl).toBeCloseTo(500 - record.charges.total, 5);
    });

    it('includes exit-side charges (STT etc.) once the trade has exited', () => {
      const record = composeTradeRecord(
        snapshot({
          state: TradeState.COMPLETED,
          exitPrice: 110,
          exitedQuantity: 50,
          exitProceeds: 5_500,
          openQuantity: 0,
          realizedPnl: 500,
        }),
        defaultTradeExtension('t1', new Date().toISOString()),
        null,
        1_700_000_010_000,
      );
      expect(record.charges.stt).toBeGreaterThan(0);
      expect(record.netPnl).toBeCloseTo(500 - record.charges.total, 5);
    });
  });
});
