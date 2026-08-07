import { TradeDirection } from './trade-direction.enum';
import { validateTradeDefinition } from './validate-trade-definition';
import type { CreateTradeParams } from './create-trade.params';

function longParams(
  overrides: Partial<CreateTradeParams> = {},
): CreateTradeParams {
  return {
    direction: TradeDirection.LONG,
    exchange: 'NFO',
    tradingSymbol: 'NIFTY24500CE',
    instrumentToken: '12345',
    quantity: 50,
    entryTriggerPrice: 100,
    initialStopLoss: 95,
    targets: [110, 120, 135, 150],
    mode: 'PAPER',
    brokerAccountId: null,
    ...overrides,
  };
}

describe('validateTradeDefinition', () => {
  it('accepts a valid LONG definition', () => {
    expect(validateTradeDefinition(longParams()).isSuccess).toBe(true);
  });

  it('accepts a valid SHORT definition', () => {
    const params = longParams({
      direction: TradeDirection.SHORT,
      entryTriggerPrice: 100,
      initialStopLoss: 105,
      targets: [90, 80, 65, 50],
    });
    expect(validateTradeDefinition(params).isSuccess).toBe(true);
  });

  it('rejects non-positive quantity', () => {
    expect(validateTradeDefinition(longParams({ quantity: 0 })).isFailure).toBe(
      true,
    );
  });

  it('rejects an empty targets list', () => {
    expect(validateTradeDefinition(longParams({ targets: [] })).isFailure).toBe(
      true,
    );
  });

  it('rejects a LONG stop loss at or above the entry trigger', () => {
    expect(
      validateTradeDefinition(longParams({ initialStopLoss: 100 })).isFailure,
    ).toBe(true);
    expect(
      validateTradeDefinition(longParams({ initialStopLoss: 101 })).isFailure,
    ).toBe(true);
  });

  it('rejects a LONG first target at or below the entry trigger', () => {
    expect(
      validateTradeDefinition(longParams({ targets: [100, 110] })).isFailure,
    ).toBe(true);
  });

  it('rejects non-increasing LONG targets', () => {
    expect(
      validateTradeDefinition(longParams({ targets: [110, 105] })).isFailure,
    ).toBe(true);
  });

  it('rejects a SHORT stop loss at or below the entry trigger', () => {
    const params = longParams({
      direction: TradeDirection.SHORT,
      initialStopLoss: 100,
      targets: [90],
    });
    expect(validateTradeDefinition(params).isFailure).toBe(true);
  });

  it('rejects non-decreasing SHORT targets', () => {
    const params = longParams({
      direction: TradeDirection.SHORT,
      initialStopLoss: 105,
      targets: [90, 95],
    });
    expect(validateTradeDefinition(params).isFailure).toBe(true);
  });

  it('rejects a blank instrument identity', () => {
    expect(
      validateTradeDefinition(longParams({ tradingSymbol: '  ' })).isFailure,
    ).toBe(true);
  });
});
