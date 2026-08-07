import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';

/** Itemized transaction costs — always present on a `TradeRecord`, even for a trade with no fills yet (every figure is simply `0` in that case). */
export interface TradeCharges {
  readonly brokerage: number;
  readonly stt: number;
  readonly exchangeCharges: number;
  readonly gst: number;
  readonly stampDuty: number;
  readonly sebiCharges: number;
  readonly total: number;
}

const ZERO_CHARGES: TradeCharges = {
  brokerage: 0,
  stt: 0,
  exchangeCharges: 0,
  gst: 0,
  stampDuty: 0,
  sebiCharges: 0,
  total: 0,
};

/** Flat per-order brokerage, or a percentage of order value, whichever is lower — the standard discount-broker model. */
const FLAT_BROKERAGE_PER_ORDER = 20;
const BROKERAGE_PERCENT_CAP = 0.0003;
/** Securities Transaction Tax — F&O options, charged on the sell-side premium value only. */
const STT_PERCENT_SELL_SIDE = 0.001;
/** Representative NSE F&O exchange transaction charge, applied to total (buy + sell) turnover. */
const EXCHANGE_CHARGES_PERCENT = 0.0005;
const GST_PERCENT = 0.18;
/** Stamp duty — buy-side value only. */
const STAMP_DUTY_PERCENT_BUY_SIDE = 0.00003;
/** SEBI turnover fee — ₹10 per crore of turnover. */
const SEBI_CHARGES_PERCENT = 0.000001;

/**
 * Representative discount-broker F&O options charge model, used to give
 * Paper Trading a realistic "net of charges" P&L — deliberately NOT a
 * tax/compliance-accurate computation (real STT/exchange/SEBI rates change
 * over time and vary by segment/instrument type); this uses commonly-cited
 * discount-broker rates for realism. Applied identically regardless of
 * trading mode — Paper and Live report the same charges for the same fills,
 * matching "Paper Trading must behave exactly like Live trading."
 *
 * `entryValue`/`exitValue` are turnover (price × quantity), not per-unit
 * price — pass `0` for whichever leg hasn't happened yet (e.g. an open
 * trade's `exitValue` is `0` until it exits), which correctly yields only
 * the charges actually incurred so far.
 */
export function calculateTradeCharges(
  direction: TradeDirection,
  entryValue: number,
  exitValue: number,
): TradeCharges {
  if (entryValue === 0 && exitValue === 0) {
    return ZERO_CHARGES;
  }

  const buyValue = direction === TradeDirection.LONG ? entryValue : exitValue;
  const sellValue = direction === TradeDirection.LONG ? exitValue : entryValue;

  const brokerageEntry =
    entryValue === 0
      ? 0
      : Math.min(FLAT_BROKERAGE_PER_ORDER, entryValue * BROKERAGE_PERCENT_CAP);
  const brokerageExit =
    exitValue === 0
      ? 0
      : Math.min(FLAT_BROKERAGE_PER_ORDER, exitValue * BROKERAGE_PERCENT_CAP);
  const brokerage = brokerageEntry + brokerageExit;

  const stt = sellValue * STT_PERCENT_SELL_SIDE;
  const turnover = entryValue + exitValue;
  const exchangeCharges = turnover * EXCHANGE_CHARGES_PERCENT;
  const sebiCharges = turnover * SEBI_CHARGES_PERCENT;
  const gst = (brokerage + exchangeCharges) * GST_PERCENT;
  const stampDuty = buyValue * STAMP_DUTY_PERCENT_BUY_SIDE;

  const total =
    brokerage + stt + exchangeCharges + gst + stampDuty + sebiCharges;

  return {
    brokerage,
    stt,
    exchangeCharges,
    gst,
    stampDuty,
    sebiCharges,
    total,
  };
}
