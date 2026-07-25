import {
  buildCancelOrderRequestBody,
  buildModifyOrderRequestBody,
  buildPlaceOrderRequestBody,
  mapAngelOneOrderStatus,
  mapOrderBookEntryToResponse,
} from './angel-one-order.mapper';
import { OrderRequest } from '../models/order-request.model';
import { OrderModification } from '../models/order-modification.model';
import { OrderSide } from '../models/order-side.enum';
import { OrderPriceType } from '../models/order-price-type.enum';
import { OrderStatus } from '../models/order-status.enum';
import { BrokerOrderApiException } from '../exceptions/broker-order-api.exception';
import type { AngelOneOrderBookEntry } from './angel-one-order-raw.dto';

function bookEntry(
  overrides: Partial<AngelOneOrderBookEntry> = {},
): AngelOneOrderBookEntry {
  return {
    orderid: 'ORDER1',
    status: 'complete',
    tradingsymbol: 'NIFTY24500CE',
    symboltoken: '123',
    exchange: 'NFO',
    quantity: '50',
    price: '100',
    filledshares: '50',
    averageprice: '123.45',
    updatetime: '2026-01-01 10:00:00',
    ...overrides,
  };
}

describe('angel-one-order.mapper', () => {
  describe('buildPlaceOrderRequestBody', () => {
    it('maps a MARKET BUY request', () => {
      const request = new OrderRequest(
        'NFO',
        'NIFTY24500CE',
        '12345',
        OrderSide.BUY,
        50,
        OrderPriceType.MARKET,
      );
      const body = buildPlaceOrderRequestBody(request);

      expect(body.transactiontype).toBe('BUY');
      expect(body.ordertype).toBe('MARKET');
      expect(body.price).toBe('0');
      expect(body.quantity).toBe('50');
      expect(body.symboltoken).toBe('12345');
    });

    it('maps a LIMIT SELL request including the price', () => {
      const request = new OrderRequest(
        'NFO',
        'NIFTY24500PE',
        '999',
        OrderSide.SELL,
        25,
        OrderPriceType.LIMIT,
        88.5,
      );
      const body = buildPlaceOrderRequestBody(request);

      expect(body.transactiontype).toBe('SELL');
      expect(body.ordertype).toBe('LIMIT');
      expect(body.price).toBe('88.5');
    });
  });

  describe('buildModifyOrderRequestBody', () => {
    it('falls back to the current quantity/price from the order-book entry when changes omit them', () => {
      const body = buildModifyOrderRequestBody(
        bookEntry({ quantity: '50', price: '100' }),
        new OrderModification(),
      );

      expect(body.orderid).toBe('ORDER1');
      expect(body.quantity).toBe('50');
      expect(body.price).toBe('100');
      expect(body.ordertype).toBe('LIMIT');
    });

    it('applies explicit changes over the order-book entry values', () => {
      const body = buildModifyOrderRequestBody(
        bookEntry({ quantity: '50', price: '100' }),
        new OrderModification(75, 120),
      );

      expect(body.quantity).toBe('75');
      expect(body.price).toBe('120');
    });

    it('treats a zero current price as a MARKET order when no priceType is specified', () => {
      const body = buildModifyOrderRequestBody(
        bookEntry({ price: '0' }),
        new OrderModification(60),
      );
      expect(body.ordertype).toBe('MARKET');
    });
  });

  describe('buildCancelOrderRequestBody', () => {
    it('includes the variety and order id', () => {
      const body = buildCancelOrderRequestBody('ORDER1');
      expect(body).toEqual({ variety: 'NORMAL', orderid: 'ORDER1' });
    });
  });

  describe('mapAngelOneOrderStatus', () => {
    it.each([
      ['open', OrderStatus.OPEN],
      ['OPEN', OrderStatus.OPEN],
      ['open pending', OrderStatus.OPEN],
      ['trigger pending', OrderStatus.OPEN],
      ['complete', OrderStatus.FILLED],
      ['cancelled', OrderStatus.CANCELLED],
      ['rejected', OrderStatus.REJECTED],
    ])('maps "%s" to %s', (raw, expected) => {
      const result = mapAngelOneOrderStatus(raw);
      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(expected);
    });

    it('fails (does not guess) for an unrecognized status', () => {
      const result = mapAngelOneOrderStatus(
        'some-new-status-we-have-never-seen',
      );
      expect(result.isFailure).toBe(true);
    });
  });

  describe('mapOrderBookEntryToResponse', () => {
    it('maps a complete order book entry to an OrderResponse', () => {
      const response = mapOrderBookEntryToResponse(bookEntry());

      expect(response.brokerOrderId).toBe('ORDER1');
      expect(response.status).toBe(OrderStatus.FILLED);
      expect(response.filledQuantity).toBe(50);
      expect(response.averagePrice).toBe(123.45);
    });

    it('treats a zero/negative average price as null (not yet filled)', () => {
      const response = mapOrderBookEntryToResponse(
        bookEntry({ status: 'open', filledshares: '0', averageprice: '0' }),
      );

      expect(response.averagePrice).toBeNull();
    });

    it('throws BrokerOrderApiException for an unrecognized status rather than guessing', () => {
      expect(() =>
        mapOrderBookEntryToResponse(
          bookEntry({ status: 'some-unknown-status' }),
        ),
      ).toThrow(BrokerOrderApiException);
    });
  });
});
