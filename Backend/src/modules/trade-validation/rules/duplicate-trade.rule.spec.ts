import type { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import type { TradeSnapshot } from '@modules/trading-engine/domain/trade-snapshot';
import { DuplicateTradeRule } from './duplicate-trade.rule';
import { ValidationContext } from '../models/validation-context';
import { ValidationFailureCode } from '../models/validation-failure-code.enum';
import { FakeClock } from '../testing/fake-clock';
import {
  buildResolvedInstrument,
  buildValidationRequest,
} from '../testing/build-request';

function fakeTradeSnapshot(overrides: Partial<TradeSnapshot>): TradeSnapshot {
  return {
    instrumentToken: 'TOKEN-1',
    state: TradeState.ACTIVE,
    ...overrides,
  } as TradeSnapshot;
}

describe('DuplicateTradeRule', () => {
  it('fails when a non-terminal trade already exists for the instrument', async () => {
    const tradingEngineService = {
      getAllTrades: jest.fn().mockReturnValue([
        fakeTradeSnapshot({
          instrumentToken: 'TOKEN-1',
          state: TradeState.ACTIVE,
        }),
      ]),
    } as unknown as TradingEngineService;
    const rule = new DuplicateTradeRule(tradingEngineService, new FakeClock());
    const context = new ValidationContext(buildValidationRequest());
    context.resolvedInstrument = buildResolvedInstrument({
      instrumentToken: 'TOKEN-1',
    });

    const result = await rule.validate(context);

    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe(
      ValidationFailureCode.DUPLICATE_ACTIVE_TRADE,
    );
  });

  it('passes when the only existing trade for the instrument is terminal', async () => {
    const tradingEngineService = {
      getAllTrades: jest.fn().mockReturnValue([
        fakeTradeSnapshot({
          instrumentToken: 'TOKEN-1',
          state: TradeState.COMPLETED,
        }),
      ]),
    } as unknown as TradingEngineService;
    const rule = new DuplicateTradeRule(tradingEngineService, new FakeClock());
    const context = new ValidationContext(buildValidationRequest());
    context.resolvedInstrument = buildResolvedInstrument({
      instrumentToken: 'TOKEN-1',
    });

    const result = await rule.validate(context);
    expect(result.isSuccess).toBe(true);
  });

  it('passes when no trade exists for the instrument at all', async () => {
    const tradingEngineService = {
      getAllTrades: jest.fn().mockReturnValue([]),
    } as unknown as TradingEngineService;
    const rule = new DuplicateTradeRule(tradingEngineService, new FakeClock());
    const context = new ValidationContext(buildValidationRequest());
    context.resolvedInstrument = buildResolvedInstrument({
      instrumentToken: 'TOKEN-1',
    });

    const result = await rule.validate(context);
    expect(result.isSuccess).toBe(true);
  });

  it('does not flag a non-terminal trade on a different instrument', async () => {
    const tradingEngineService = {
      getAllTrades: jest.fn().mockReturnValue([
        fakeTradeSnapshot({
          instrumentToken: 'OTHER-TOKEN',
          state: TradeState.ACTIVE,
        }),
      ]),
    } as unknown as TradingEngineService;
    const rule = new DuplicateTradeRule(tradingEngineService, new FakeClock());
    const context = new ValidationContext(buildValidationRequest());
    context.resolvedInstrument = buildResolvedInstrument({
      instrumentToken: 'TOKEN-1',
    });

    const result = await rule.validate(context);
    expect(result.isSuccess).toBe(true);
  });
});
