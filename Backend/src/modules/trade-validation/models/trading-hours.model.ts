/**
 * Expressed in UTC-minutes-since-midnight rather than local wall-clock time,
 * so this never depends on the server process's configured timezone.
 * Defaults are NSE's standard equity session: 09:15-15:30 IST
 * (= 03:45-10:00 UTC), Monday-Friday.
 */
export interface TradingHoursConfig {
  readonly startUtcMinutes: number;
  readonly endUtcMinutes: number;
  /** 0 = Sunday .. 6 = Saturday (JS Date convention). */
  readonly tradingDays: readonly number[];
}

export const DEFAULT_TRADING_HOURS: TradingHoursConfig = {
  startUtcMinutes: 3 * 60 + 45,
  endUtcMinutes: 10 * 60,
  tradingDays: [1, 2, 3, 4, 5],
};

export function isWithinTradingHours(
  now: Date,
  config: TradingHoursConfig,
): boolean {
  if (!config.tradingDays.includes(now.getUTCDay())) {
    return false;
  }
  const minutesOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();
  return (
    minutesOfDay >= config.startUtcMinutes &&
    minutesOfDay <= config.endUtcMinutes
  );
}
