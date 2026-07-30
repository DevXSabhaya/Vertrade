import { Result } from '@shared/types/result';
import {
  DHAN_FEED_RESPONSE_CODE_DISCONNECT,
  DHAN_FEED_RESPONSE_CODE_FULL,
  DHAN_FEED_RESPONSE_CODE_OI,
  DHAN_FEED_RESPONSE_CODE_QUOTE,
  DHAN_FEED_RESPONSE_CODE_TICKER,
} from './dhan-market-data.constants';

/**
 * Fields normalized out of DhanHQ's binary live-market-feed protocol
 * (https://dhanhq.co/docs/v2/live-market-feed/). Byte offsets for the
 * Ticker/Full packets were cross-verified against Dhan's own official
 * Python client's `struct.unpack` format strings
 * (dhan-oss/DhanHQ-py/src/dhanhq/marketfeed.py) — not exercised against a
 * real live feed in this environment (no live credentials, automated tests
 * never open a real socket).
 *
 * `bestBid`/`bestAsk`/`volume`/`openInterest` are `null` when the packet
 * type doesn't carry that field — never fabricated as 0.
 *
 * Feed Response Code 1 (Index Packet) is deliberately NOT parsed here: its
 * byte layout is not published anywhere in DhanHQ's documentation, and even
 * Dhan's own official Python client (`marketfeed.py`'s `process_data()`)
 * has no case for it — only codes 2, 4, 5, 6, 7, 8, and 50 are handled
 * there. Inventing an unverified struct here would risk silently
 * misparsing index ticks rather than honestly failing. Code 7 (Market
 * Status Packet) is equally undocumented and is not parsed for the same
 * reason.
 */
export interface DhanParsedTick {
  readonly feedResponseCode: number;
  readonly exchangeSegmentCode: number;
  readonly securityId: string;
  readonly lastPrice: number;
  readonly lastTradeTime: number | null;
  readonly bestBid: number | null;
  readonly bestAsk: number | null;
  readonly volume: number | null;
  readonly openInterest: number | null;
}

/** 8-byte header common to every Dhan feed response packet. */
const HEADER_LENGTH = 8;
const TICKER_PAYLOAD_LENGTH = HEADER_LENGTH + 8;
const OI_PAYLOAD_LENGTH = HEADER_LENGTH + 4;
/** Quote packet: LTP..Low fixed fields, no market depth. */
const QUOTE_PAYLOAD_LENGTH = HEADER_LENGTH + 42;
/** Full packet: LTP..Low fixed fields (54 bytes) + 5 depth levels x 20 bytes. */
const FULL_PACKET_FIXED_LENGTH = 54;
const DEPTH_LEVEL_LENGTH = 20;
const FULL_PAYLOAD_LENGTH = HEADER_LENGTH + FULL_PACKET_FIXED_LENGTH;

function readDepthLevel1(
  view: DataView,
  buffer: ArrayBuffer,
): { bestBid: number | null; bestAsk: number | null } {
  const depthLevel1Offset = HEADER_LENGTH + FULL_PACKET_FIXED_LENGTH;
  if (buffer.byteLength < depthLevel1Offset + DEPTH_LEVEL_LENGTH) {
    return { bestBid: null, bestAsk: null };
  }
  // Level 1 of 5: bidQty(4) + askQty(4) + bidOrders(2) + askOrders(2), then prices.
  return {
    bestBid: view.getFloat32(depthLevel1Offset + 12, true),
    bestAsk: view.getFloat32(depthLevel1Offset + 16, true),
  };
}

/**
 * Parses one binary WebSocket frame from Dhan's live market feed. Never
 * guesses: an unrecognized feed response code, or a buffer too short for
 * the code it claims to be, is a Result.fail rather than a best-effort
 * partial parse.
 */
export function parseDhanBinaryTick(
  buffer: ArrayBuffer,
): Result<DhanParsedTick, string> {
  if (buffer.byteLength < HEADER_LENGTH) {
    return Result.fail(
      `Dhan tick frame too short for even a header: ${buffer.byteLength} bytes`,
    );
  }

  const view = new DataView(buffer);
  const feedResponseCode = view.getUint8(0);
  const exchangeSegmentCode = view.getUint8(3);
  const securityId = String(view.getInt32(4, true));

  if (feedResponseCode === DHAN_FEED_RESPONSE_CODE_DISCONNECT) {
    return Result.fail('Dhan sent a server-initiated disconnect packet');
  }

  if (feedResponseCode === DHAN_FEED_RESPONSE_CODE_TICKER) {
    if (buffer.byteLength < TICKER_PAYLOAD_LENGTH) {
      return Result.fail(
        `Dhan Ticker packet too short: ${buffer.byteLength} bytes`,
      );
    }
    return Result.ok({
      feedResponseCode,
      exchangeSegmentCode,
      securityId,
      lastPrice: view.getFloat32(HEADER_LENGTH, true),
      lastTradeTime: view.getInt32(HEADER_LENGTH + 4, true),
      bestBid: null,
      bestAsk: null,
      volume: null,
      openInterest: null,
    });
  }

  if (feedResponseCode === DHAN_FEED_RESPONSE_CODE_OI) {
    if (buffer.byteLength < OI_PAYLOAD_LENGTH) {
      return Result.fail(
        `Dhan OI packet too short: ${buffer.byteLength} bytes`,
      );
    }
    return Result.ok({
      feedResponseCode,
      exchangeSegmentCode,
      securityId,
      // The OI packet carries no LTP of its own — this is a supplementary
      // update, never the primary tick source (Full-mode subscriptions,
      // which this app always uses, already embed OI directly).
      lastPrice: 0,
      lastTradeTime: null,
      bestBid: null,
      bestAsk: null,
      volume: null,
      openInterest: view.getInt32(HEADER_LENGTH, true),
    });
  }

  if (feedResponseCode === DHAN_FEED_RESPONSE_CODE_QUOTE) {
    if (buffer.byteLength < QUOTE_PAYLOAD_LENGTH) {
      return Result.fail(
        `Dhan Quote packet too short: ${buffer.byteLength} bytes`,
      );
    }
    return Result.ok({
      feedResponseCode,
      exchangeSegmentCode,
      securityId,
      lastPrice: view.getFloat32(HEADER_LENGTH, true),
      lastTradeTime: view.getInt32(HEADER_LENGTH + 6, true),
      bestBid: null,
      bestAsk: null,
      volume: view.getInt32(HEADER_LENGTH + 14, true),
      // The Quote packet has no OI field of its own — Dhan sends a
      // separate OI (code 5) packet alongside Quote-mode subscriptions.
      openInterest: null,
    });
  }

  if (feedResponseCode === DHAN_FEED_RESPONSE_CODE_FULL) {
    if (buffer.byteLength < FULL_PAYLOAD_LENGTH) {
      return Result.fail(
        `Dhan Full packet too short: ${buffer.byteLength} bytes`,
      );
    }
    const { bestBid, bestAsk } = readDepthLevel1(view, buffer);

    return Result.ok({
      feedResponseCode,
      exchangeSegmentCode,
      securityId,
      lastPrice: view.getFloat32(HEADER_LENGTH, true),
      lastTradeTime: view.getInt32(HEADER_LENGTH + 6, true),
      bestBid,
      bestAsk,
      volume: view.getInt32(HEADER_LENGTH + 14, true),
      openInterest: view.getInt32(HEADER_LENGTH + 26, true),
    });
  }

  return Result.fail(
    `Unrecognized Dhan feed response code: ${feedResponseCode}`,
  );
}
