import type { HealthIndicatorResult } from '../models/health-indicator-result.model';

/**
 * Every monitored component is fully isolated behind this interface — the
 * aggregator knows nothing about brokers, WebSockets, or Mongo, only that it
 * can `check()` a list of indicators. Adding a new one is a new class plus
 * one line in BrokerHealthModule's registry, never a change to the
 * aggregator (Open/Closed Principle) — same pattern as Phase 7's Rule
 * Registry.
 */
export interface IHealthIndicator {
  readonly name: string;
  check(): Promise<HealthIndicatorResult>;
}
