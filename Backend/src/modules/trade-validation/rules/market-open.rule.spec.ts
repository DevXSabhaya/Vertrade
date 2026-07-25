import { MarketOpenRule } from './market-open.rule';
import { ValidationFailureCode } from '../models/validation-failure-code.enum';
import { DEFAULT_TRADING_HOURS } from '../models/trading-hours.model';
import { FakeClock } from '../testing/fake-clock';

describe('MarketOpenRule', () => {
  it('passes during trading hours', async () => {
    const clock = new FakeClock();
    clock.setTo(new Date('2026-01-05T05:00:00Z').getTime());
    const rule = new MarketOpenRule(DEFAULT_TRADING_HOURS, clock);

    const result = await rule.validate();
    expect(result.isSuccess).toBe(true);
  });

  it('fails with MARKET_CLOSED outside trading hours', async () => {
    const clock = new FakeClock();
    clock.setTo(new Date('2026-01-05T20:00:00Z').getTime());
    const rule = new MarketOpenRule(DEFAULT_TRADING_HOURS, clock);

    const result = await rule.validate();
    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe(ValidationFailureCode.MARKET_CLOSED);
  });

  it('fails on a weekend', async () => {
    const clock = new FakeClock();
    clock.setTo(new Date('2026-01-03T05:00:00Z').getTime());
    const rule = new MarketOpenRule(DEFAULT_TRADING_HOURS, clock);

    const result = await rule.validate();
    expect(result.isFailure).toBe(true);
  });
});
