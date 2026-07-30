import { mapDhanOrderStatus } from './dhan-order.mapper';
import { OrderStatus } from '../models/order-status.enum';

describe('mapDhanOrderStatus', () => {
  it.each([
    ['TRANSIT', OrderStatus.OPEN],
    ['PENDING', OrderStatus.OPEN],
    ['PART_TRADED', OrderStatus.PARTIALLY_FILLED],
    ['TRADED', OrderStatus.FILLED],
    ['CANCELLED', OrderStatus.CANCELLED],
    ['REJECTED', OrderStatus.REJECTED],
  ])(
    'maps Dhan\'s official status "%s" to %s (case-insensitively)',
    (rawStatus, expected) => {
      expect(mapDhanOrderStatus(rawStatus).value).toBe(expected);
      expect(mapDhanOrderStatus(rawStatus.toLowerCase()).value).toBe(expected);
    },
  );

  it('fails (never guesses) for CLOSED/TRIGGERED — real Dhan statuses, but Super-Order-only, never returned for the plain INTRADAY orders this executor places', () => {
    expect(mapDhanOrderStatus('CLOSED').isFailure).toBe(true);
    expect(mapDhanOrderStatus('TRIGGERED').isFailure).toBe(true);
  });

  it('fails (never guesses) for "expired" and "trigger pending" — neither is a real DhanHQ order status per its official Annexure reference', () => {
    expect(mapDhanOrderStatus('expired').isFailure).toBe(true);
    expect(mapDhanOrderStatus('trigger pending').isFailure).toBe(true);
  });

  it('fails for a completely unrecognized status', () => {
    const result = mapDhanOrderStatus('SOMETHING_ELSE');
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('SOMETHING_ELSE');
  });
});
