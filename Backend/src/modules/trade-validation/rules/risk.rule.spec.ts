import type { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import type { TradeSnapshot } from '@modules/trading-engine/domain/trade-snapshot';
import { RiskRule } from './risk.rule';
import { ValidationContext } from '../models/validation-context';
import { ValidationFailureCode } from '../models/validation-failure-code.enum';
import type { RiskLimitsConfig } from '../models/risk-limits.model';
import { FakeClock } from '../testing/fake-clock';
import { buildValidationRequest } from '../testing/build-request';

function fakeTradeSnapshot(overrides: Partial<TradeSnapshot>): TradeSnapshot {
  const now = new Date('2026-01-05T05:00:00Z').toISOString();
  return {
    state: TradeState.ACTIVE,
    createdAt: now,
    updatedAt: now,
    realizedPnl: null,
    ...overrides,
  } as TradeSnapshot;
}

function limits(overrides: Partial<RiskLimitsConfig> = {}): RiskLimitsConfig {
  return {
    maxOpenTrades: 5,
    maxDailyTrades: 10,
    maxDailyLoss: 1000,
    maxQuantity: 500,
    ...overrides,
  };
}

function engineWith(trades: TradeSnapshot[]): TradingEngineService {
  return {
    getAllTrades: jest.fn().mockReturnValue(trades),
  } as unknown as TradingEngineService;
}

describe('RiskRule', () => {
  it('passes when every limit is within bounds', async () => {
    const clock = new FakeClock();
    clock.setTo(new Date('2026-01-05T06:00:00Z').getTime());
    const rule = new RiskRule(engineWith([]), limits(), clock);

    const result = await rule.validate(
      new ValidationContext(buildValidationRequest({ quantity: 50 })),
    );
    expect(result.isSuccess).toBe(true);
  });

  it('rejects a quantity above the maximum allowed', async () => {
    const rule = new RiskRule(
      engineWith([]),
      limits({ maxQuantity: 10 }),
      new FakeClock(),
    );
    const result = await rule.validate(
      new ValidationContext(buildValidationRequest({ quantity: 50 })),
    );
    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe(ValidationFailureCode.RISK_LIMIT_EXCEEDED);
  });

  it('rejects once the maximum open trades limit is reached', async () => {
    const trades = [
      fakeTradeSnapshot({ state: TradeState.ACTIVE }),
      fakeTradeSnapshot({ state: TradeState.WAITING_ENTRY }),
    ];
    const rule = new RiskRule(
      engineWith(trades),
      limits({ maxOpenTrades: 2 }),
      new FakeClock(),
    );
    const result = await rule.validate(
      new ValidationContext(buildValidationRequest()),
    );
    expect(result.isFailure).toBe(true);
  });

  it('does not count terminal trades toward the open trades limit', async () => {
    const trades = [
      fakeTradeSnapshot({ state: TradeState.COMPLETED }),
      fakeTradeSnapshot({ state: TradeState.CANCELLED }),
    ];
    const rule = new RiskRule(
      engineWith(trades),
      limits({ maxOpenTrades: 1 }),
      new FakeClock(),
    );
    const result = await rule.validate(
      new ValidationContext(buildValidationRequest()),
    );
    expect(result.isSuccess).toBe(true);
  });

  it('rejects once the maximum daily trades limit is reached', async () => {
    const clock = new FakeClock();
    clock.setTo(new Date('2026-01-05T06:00:00Z').getTime());
    const trades = [
      fakeTradeSnapshot({
        createdAt: new Date('2026-01-05T02:00:00Z').toISOString(),
      }),
      fakeTradeSnapshot({
        createdAt: new Date('2026-01-05T03:00:00Z').toISOString(),
      }),
    ];
    const rule = new RiskRule(
      engineWith(trades),
      limits({ maxDailyTrades: 2 }),
      clock,
    );
    const result = await rule.validate(
      new ValidationContext(buildValidationRequest()),
    );
    expect(result.isFailure).toBe(true);
  });

  it('does not count trades created on a previous day toward the daily limit', async () => {
    const clock = new FakeClock();
    clock.setTo(new Date('2026-01-05T06:00:00Z').getTime());
    const trades = [
      fakeTradeSnapshot({
        createdAt: new Date('2026-01-04T06:00:00Z').toISOString(),
      }),
    ];
    const rule = new RiskRule(
      engineWith(trades),
      limits({ maxDailyTrades: 1 }),
      clock,
    );
    const result = await rule.validate(
      new ValidationContext(buildValidationRequest()),
    );
    expect(result.isSuccess).toBe(true);
  });

  it('rejects once the maximum daily loss limit is breached', async () => {
    const clock = new FakeClock();
    clock.setTo(new Date('2026-01-05T06:00:00Z').getTime());
    const trades = [
      fakeTradeSnapshot({
        state: TradeState.COMPLETED,
        realizedPnl: -1200,
        updatedAt: new Date('2026-01-05T05:00:00Z').toISOString(),
      }),
    ];
    const rule = new RiskRule(
      engineWith(trades),
      limits({ maxDailyLoss: 1000 }),
      clock,
    );
    const result = await rule.validate(
      new ValidationContext(buildValidationRequest()),
    );
    expect(result.isFailure).toBe(true);
  });

  it('does not count a profitable day toward the daily loss limit', async () => {
    const clock = new FakeClock();
    clock.setTo(new Date('2026-01-05T06:00:00Z').getTime());
    const trades = [
      fakeTradeSnapshot({
        state: TradeState.COMPLETED,
        realizedPnl: 5000,
        updatedAt: new Date('2026-01-05T05:00:00Z').toISOString(),
      }),
    ];
    const rule = new RiskRule(
      engineWith(trades),
      limits({ maxDailyLoss: 1000 }),
      clock,
    );
    const result = await rule.validate(
      new ValidationContext(buildValidationRequest()),
    );
    expect(result.isSuccess).toBe(true);
  });
});
