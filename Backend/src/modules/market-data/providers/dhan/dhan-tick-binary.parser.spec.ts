import { parseDhanBinaryTick } from './dhan-tick-binary.parser';
import {
  DHAN_FEED_RESPONSE_CODE_DISCONNECT,
  DHAN_FEED_RESPONSE_CODE_FULL,
  DHAN_FEED_RESPONSE_CODE_OI,
  DHAN_FEED_RESPONSE_CODE_QUOTE,
  DHAN_FEED_RESPONSE_CODE_TICKER,
} from './dhan-market-data.constants';

function buildHeader(
  view: DataView,
  feedResponseCode: number,
  messageLength: number,
  exchangeSegmentCode: number,
  securityId: number,
): void {
  view.setUint8(0, feedResponseCode);
  view.setInt16(1, messageLength, true);
  view.setUint8(3, exchangeSegmentCode);
  view.setInt32(4, securityId, true);
}

function buildTickerPacket(): ArrayBuffer {
  const buffer = new ArrayBuffer(16);
  const view = new DataView(buffer);
  buildHeader(view, DHAN_FEED_RESPONSE_CODE_TICKER, 16, 2, 49081);
  view.setFloat32(8, 24555.5, true);
  view.setInt32(12, 1_700_000_000, true);
  return buffer;
}

function buildFullPacket(): ArrayBuffer {
  const buffer = new ArrayBuffer(8 + 54 + 100);
  const view = new DataView(buffer);
  buildHeader(view, DHAN_FEED_RESPONSE_CODE_FULL, buffer.byteLength, 2, 49081);
  view.setFloat32(8, 24555.5, true); // LTP
  view.setInt16(12, 25, true); // LTQ
  view.setInt32(14, 1_700_000_000, true); // LTT
  view.setFloat32(18, 24550.0, true); // ATP
  view.setInt32(22, 123456, true); // Volume
  view.setInt32(26, 1000, true); // TotalSellQty
  view.setInt32(30, 2000, true); // TotalBuyQty
  view.setInt32(34, 55000, true); // OI
  // Depth level 1 starts at offset 8 + 54 = 62
  const depthOffset = 62;
  view.setInt32(depthOffset, 75, true); // bidQty
  view.setInt32(depthOffset + 4, 60, true); // askQty
  view.setInt16(depthOffset + 8, 3, true); // bidOrders
  view.setInt16(depthOffset + 10, 2, true); // askOrders
  view.setFloat32(depthOffset + 12, 24555.0, true); // bidPrice
  view.setFloat32(depthOffset + 16, 24556.0, true); // askPrice
  return buffer;
}

function buildOiPacket(): ArrayBuffer {
  const buffer = new ArrayBuffer(12);
  const view = new DataView(buffer);
  buildHeader(view, DHAN_FEED_RESPONSE_CODE_OI, 12, 2, 49081);
  view.setInt32(8, 55000, true);
  return buffer;
}

function buildQuotePacket(): ArrayBuffer {
  const buffer = new ArrayBuffer(8 + 42);
  const view = new DataView(buffer);
  buildHeader(view, DHAN_FEED_RESPONSE_CODE_QUOTE, buffer.byteLength, 2, 49081);
  view.setFloat32(8, 24555.5, true); // LTP
  view.setInt16(12, 25, true); // LTQ
  view.setInt32(14, 1_700_000_000, true); // LTT
  view.setFloat32(18, 24550.0, true); // ATP
  view.setInt32(22, 123456, true); // Volume
  return buffer;
}

describe('parseDhanBinaryTick', () => {
  it('parses a Ticker packet: LTP + LTT only, everything else null', () => {
    const result = parseDhanBinaryTick(buildTickerPacket());

    expect(result.isSuccess).toBe(true);
    expect(result.value).toMatchObject({
      feedResponseCode: DHAN_FEED_RESPONSE_CODE_TICKER,
      exchangeSegmentCode: 2,
      securityId: '49081',
      lastPrice: 24555.5,
      lastTradeTime: 1_700_000_000,
      bestBid: null,
      bestAsk: null,
      volume: null,
      openInterest: null,
    });
  });

  it('parses a Full packet: LTP, volume, OI, and level-1 bid/ask from market depth', () => {
    const result = parseDhanBinaryTick(buildFullPacket());

    expect(result.isSuccess).toBe(true);
    expect(result.value).toMatchObject({
      feedResponseCode: DHAN_FEED_RESPONSE_CODE_FULL,
      securityId: '49081',
      lastPrice: 24555.5,
      volume: 123456,
      openInterest: 55000,
      bestBid: 24555.0,
      bestAsk: 24556.0,
    });
  });

  it('parses an OI packet: open interest only, LTP reported as 0 rather than fabricated', () => {
    const result = parseDhanBinaryTick(buildOiPacket());

    expect(result.isSuccess).toBe(true);
    expect(result.value).toMatchObject({
      feedResponseCode: DHAN_FEED_RESPONSE_CODE_OI,
      securityId: '49081',
      openInterest: 55000,
      bestBid: null,
      bestAsk: null,
      volume: null,
    });
  });

  it('parses a Quote packet: LTP + volume, no bid/ask/OI (no market depth in Quote mode)', () => {
    const result = parseDhanBinaryTick(buildQuotePacket());

    expect(result.isSuccess).toBe(true);
    expect(result.value).toMatchObject({
      feedResponseCode: DHAN_FEED_RESPONSE_CODE_QUOTE,
      securityId: '49081',
      lastPrice: 24555.5,
      lastTradeTime: 1_700_000_000,
      volume: 123456,
      bestBid: null,
      bestAsk: null,
      openInterest: null,
    });
  });

  it("fails on an Index packet (code 1) — deliberately unimplemented, matching Dhan's own official client", () => {
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);
    buildHeader(view, 1, 16, 0, 13);

    const result = parseDhanBinaryTick(buffer);
    expect(result.isFailure).toBe(true);
  });

  it('fails (never guesses) on an unrecognized feed response code', () => {
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);
    buildHeader(view, 99, 16, 2, 1);

    const result = parseDhanBinaryTick(buffer);
    expect(result.isFailure).toBe(true);
  });

  it('fails on a server-initiated disconnect packet', () => {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    buildHeader(view, DHAN_FEED_RESPONSE_CODE_DISCONNECT, 8, 2, 1);

    const result = parseDhanBinaryTick(buffer);
    expect(result.isFailure).toBe(true);
  });

  it('fails on a buffer too short to contain even a header', () => {
    const result = parseDhanBinaryTick(new ArrayBuffer(4));
    expect(result.isFailure).toBe(true);
  });

  it('fails on a Ticker-coded buffer too short for its payload', () => {
    const buffer = new ArrayBuffer(10);
    const view = new DataView(buffer);
    buildHeader(view, DHAN_FEED_RESPONSE_CODE_TICKER, 16, 2, 1);

    const result = parseDhanBinaryTick(buffer);
    expect(result.isFailure).toBe(true);
  });

  it('parses a Full packet without market depth bytes present, leaving bid/ask null', () => {
    const buffer = new ArrayBuffer(8 + 54);
    const view = new DataView(buffer);
    buildHeader(view, DHAN_FEED_RESPONSE_CODE_FULL, buffer.byteLength, 2, 1);
    view.setFloat32(8, 100, true);

    const result = parseDhanBinaryTick(buffer);
    expect(result.isSuccess).toBe(true);
    expect(result.value.bestBid).toBeNull();
    expect(result.value.bestAsk).toBeNull();
  });
});
