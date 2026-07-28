import type { ConfigService } from '@core/config/config.service';
import type { IOrderExecutor } from './order-executor.interface';

/**
 * Picks the executor matching a given mode — shared by `RoutingOrderExecutor`
 * (current-deployment-mode-scoped consumers, e.g. reconciliation) and
 * `TradingEngineService.executorFor()` (per-trade-pinned mode, captured once
 * at trade creation — see that method's own docstring for why those two
 * differ). Kept in its own plain (non-`@Module`) file — importing it must
 * never drag in `ExecutorsModule`'s `ConfigModule.forRoot(...)` side effects,
 * which would run real env validation during plain unit-test module
 * resolution.
 */
export function selectOrderExecutor(
  configService: Pick<ConfigService, 'tradingMode'>,
  paperExecutor: IOrderExecutor,
  angelOneExecutor: IOrderExecutor,
): IOrderExecutor {
  return configService.tradingMode === 'LIVE'
    ? angelOneExecutor
    : paperExecutor;
}
