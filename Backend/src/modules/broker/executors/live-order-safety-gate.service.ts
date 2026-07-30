import { Inject, Injectable, Logger } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { FeatureFlagsService } from '@core/feature-flags/feature-flag.service';
import { TradingModeService } from '@modules/trading-mode/trading-mode.service';
import { HealthStatus } from '@modules/broker-health/models/health-status.enum';
import type { HealthSnapshot } from '@modules/broker-health/models/health-snapshot.model';
import type { HealthSnapshotUpdatedEvent } from '@modules/broker-health/events/health-snapshot-updated.event';

/** Off by default — LIVE trading requires an operator to explicitly flip this on, in addition to TRADING_MODE=LIVE itself. Two independent switches must both be set, not one. */
export const LIVE_TRADING_ENABLED_FLAG = 'LIVE_TRADING_ENABLED';

export interface LiveOrderGateResult {
  readonly allowed: boolean;
  readonly reason: string | null;
}

/**
 * The last line of defense before `DhanExecutor` ever calls the real
 * broker API — separate from (and in addition to) the risk-management
 * kill-switch/emergency-stop checks that already run earlier in the
 * pipeline (`RiskEvaluationService`, consulted by `TradeValidationService`
 * before a trade even reaches the Order Queue). This gate only ever
 * matters for `TRADING_MODE=LIVE`; for PAPER it's a permanent no-op
 * (`checkEntryAllowed` short-circuits to allowed), so it can never affect
 * paper trading behavior.
 *
 * Deliberately does NOT inject `BrokerHealthService`/`KillSwitchService`/
 * `EmergencyStopService` directly — `BrokerHealthModule` already imports
 * `OrderQueueModule` (for its order-queue health indicator), and
 * `OrderQueueModule` imports `TradingEngineModule`, which imports
 * `ExecutorsModule` — a direct import here would be a circular module
 * dependency. Instead this subscribes to the same
 * `HealthSnapshotUpdatedEvent` `BrokerHealthService` already publishes on
 * the global event bus and caches the latest snapshot in memory — no
 * module coupling required. Starts UNKNOWN (fails safe: blocks live
 * entries) until the first real health check has run.
 */
@Injectable()
export class LiveOrderSafetyGateService {
  private readonly logger = new Logger(LiveOrderSafetyGateService.name);
  private latestSnapshot: HealthSnapshot | null = null;

  constructor(
    private readonly tradingModeService: TradingModeService,
    private readonly featureFlagsService: FeatureFlagsService,
    @Inject(EVENT_BUS) eventBus: IEventBus,
  ) {
    eventBus.subscribe<HealthSnapshotUpdatedEvent>(
      'broker-health.snapshot.updated',
      (event) => {
        this.latestSnapshot = event.snapshot;
      },
    );
  }

  /**
   * Checked once per live entry order, immediately before
   * `DhanExecutor.placeEntryOrder` calls the real broker API. Exits are
   * deliberately never gated here — a risk-reducing action (closing an
   * already-open live position) must never be silently blocked by a
   * missing confirmation flag or a stale health snapshot; that would turn
   * a safety mechanism into a hazard.
   *
   * `DhanExecutor.placeEntryOrder` is only ever reached for a trade
   * whose own `mode` was already pinned to LIVE at creation time (see
   * `TradingEngineService.executorFor`) — so the check below is not "is
   * this deployment LIVE by default," it's "is this deployment *still*
   * LIVE right now." An operator switching the deployment's current mode
   * away from LIVE (`TradingModeService.setMode('PAPER', ...)`) therefore
   * acts as an immediate brake on any further live entries from
   * already-armed LIVE trades too — this must block, never silently pass
   * a live order through as if the check didn't apply.
   */
  async checkEntryAllowed(confirmed: boolean): Promise<LiveOrderGateResult> {
    if (this.tradingModeService.getCurrentMode() !== 'LIVE') {
      return this.blocked(
        'This deployment is not currently in LIVE mode — a previously-armed live trade cannot place new entry orders until LIVE mode is re-enabled',
      );
    }

    if (!confirmed) {
      return this.blocked(
        'Live trading requires explicit per-order confirmation (liveTradingConfirmed) — none was provided',
      );
    }

    const liveTradingEnabled = await this.featureFlagsService.isEnabled(
      LIVE_TRADING_ENABLED_FLAG,
    );
    if (!liveTradingEnabled) {
      return this.blocked(
        `Live trading is not armed — the "${LIVE_TRADING_ENABLED_FLAG}" feature flag is off`,
      );
    }

    if (!this.latestSnapshot) {
      return this.blocked(
        'No broker health snapshot is available yet — refusing to place a live order against an unverified broker connection',
      );
    }

    if (this.latestSnapshot.overallStatus !== HealthStatus.HEALTHY) {
      return this.blocked(
        `Broker health is not HEALTHY (current: ${this.latestSnapshot.overallStatus})`,
      );
    }

    if (this.latestSnapshot.authStatus !== HealthStatus.HEALTHY) {
      return this.blocked(
        `Broker authentication is not HEALTHY (current: ${this.latestSnapshot.authStatus})`,
      );
    }

    return { allowed: true, reason: null };
  }

  private blocked(reason: string): LiveOrderGateResult {
    this.logger.warn(`Live order blocked: ${reason}`);
    return { allowed: false, reason };
  }
}
