import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { ResolvedInstrument } from '@modules/instrument-resolver/resolved-instrument.vo';
import type { TradeValidationRequest } from '../models/trade-validation-request.model';

export function buildValidationRequest(
  overrides: Partial<TradeValidationRequest> = {},
): TradeValidationRequest {
  return {
    rawSymbol: 'NIFTY 24500 CE',
    direction: TradeDirection.LONG,
    quantity: 50,
    entryTriggerPrice: 100,
    initialStopLoss: 95,
    targets: [110, 120, 135, 150],
    ...overrides,
  };
}

export function buildResolvedInstrument(
  overrides: Partial<{
    exchange: string;
    tradingSymbol: string;
    instrumentToken: string;
    lotSize: number;
  }> = {},
): ResolvedInstrument {
  return new ResolvedInstrument(
    overrides.exchange ?? 'NFO',
    'OPTIDX',
    overrides.tradingSymbol ?? 'NIFTY24500CE',
    overrides.instrumentToken ?? 'TOKEN-1',
    null,
    24500,
    null,
    0.05,
    overrides.lotSize ?? 50,
    2,
  );
}
