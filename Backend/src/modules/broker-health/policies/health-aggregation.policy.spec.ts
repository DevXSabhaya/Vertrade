import { HealthStatus } from '../models/health-status.enum';
import { HealthAggregationPolicy } from './health-aggregation.policy';

describe('HealthAggregationPolicy', () => {
  it('returns UNKNOWN for an empty result set', () => {
    expect(HealthAggregationPolicy.aggregateStatuses([])).toBe(
      HealthStatus.UNKNOWN,
    );
  });

  it('returns HEALTHY when every status is HEALTHY', () => {
    expect(
      HealthAggregationPolicy.aggregateStatuses([
        HealthStatus.HEALTHY,
        HealthStatus.HEALTHY,
      ]),
    ).toBe(HealthStatus.HEALTHY);
  });

  it('returns the single most severe status among a mix', () => {
    expect(
      HealthAggregationPolicy.aggregateStatuses([
        HealthStatus.HEALTHY,
        HealthStatus.WARNING,
        HealthStatus.HEALTHY,
      ]),
    ).toBe(HealthStatus.WARNING);
  });

  it('DISCONNECTED always wins over everything else', () => {
    expect(
      HealthAggregationPolicy.aggregateStatuses([
        HealthStatus.DEGRADED,
        HealthStatus.DISCONNECTED,
        HealthStatus.WARNING,
      ]),
    ).toBe(HealthStatus.DISCONNECTED);
  });

  it('ranks severity: HEALTHY < UNKNOWN < WARNING < RECOVERING < DEGRADED < DISCONNECTED', () => {
    const order = [
      HealthStatus.HEALTHY,
      HealthStatus.UNKNOWN,
      HealthStatus.WARNING,
      HealthStatus.RECOVERING,
      HealthStatus.DEGRADED,
      HealthStatus.DISCONNECTED,
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(HealthAggregationPolicy.isMoreSevere(order[i], order[i - 1])).toBe(
        true,
      );
    }
  });

  it("aggregate() delegates to aggregateStatuses() using each result's status", () => {
    const results = [
      { name: 'a', status: HealthStatus.HEALTHY, checkedAt: 'x' },
      { name: 'b', status: HealthStatus.DEGRADED, checkedAt: 'x' },
    ];
    expect(HealthAggregationPolicy.aggregate(results)).toBe(
      HealthStatus.DEGRADED,
    );
  });
});
