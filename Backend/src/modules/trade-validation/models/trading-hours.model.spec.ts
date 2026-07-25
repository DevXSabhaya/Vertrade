import {
  DEFAULT_TRADING_HOURS,
  isWithinTradingHours,
} from './trading-hours.model';

describe('isWithinTradingHours', () => {
  it('is true at market open (09:15 IST / 03:45 UTC) on a Monday', () => {
    const monday915Ist = new Date('2026-01-05T03:45:00Z');
    expect(isWithinTradingHours(monday915Ist, DEFAULT_TRADING_HOURS)).toBe(
      true,
    );
  });

  it('is true at market close (15:30 IST / 10:00 UTC) on a Monday', () => {
    const monday1530Ist = new Date('2026-01-05T10:00:00Z');
    expect(isWithinTradingHours(monday1530Ist, DEFAULT_TRADING_HOURS)).toBe(
      true,
    );
  });

  it('is false before market open', () => {
    const beforeOpen = new Date('2026-01-05T03:44:00Z');
    expect(isWithinTradingHours(beforeOpen, DEFAULT_TRADING_HOURS)).toBe(false);
  });

  it('is false after market close', () => {
    const afterClose = new Date('2026-01-05T10:01:00Z');
    expect(isWithinTradingHours(afterClose, DEFAULT_TRADING_HOURS)).toBe(false);
  });

  it('is false on a Saturday even during trading-hour minutes', () => {
    const saturday = new Date('2026-01-03T05:00:00Z');
    expect(isWithinTradingHours(saturday, DEFAULT_TRADING_HOURS)).toBe(false);
  });

  it('is false on a Sunday', () => {
    const sunday = new Date('2026-01-04T05:00:00Z');
    expect(isWithinTradingHours(sunday, DEFAULT_TRADING_HOURS)).toBe(false);
  });
});
