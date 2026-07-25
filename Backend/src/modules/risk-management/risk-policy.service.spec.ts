import type { IRiskPolicyRepository } from './interfaces/risk-policy-repository.interface';
import { RiskPolicyService } from './risk-policy.service';
import {
  DEFAULT_RISK_POLICY,
  type RiskPolicy,
} from './models/risk-policy.model';
import { FakeClock } from './testing/fake-clock';

function repository(
  persisted: RiskPolicy | null = null,
): jest.Mocked<IRiskPolicyRepository> {
  return {
    find: jest.fn().mockResolvedValue(persisted),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

describe('RiskPolicyService', () => {
  it('persists and caches the default policy when nothing exists yet', async () => {
    const repo = repository(null);
    const service = new RiskPolicyService(repo, new FakeClock());

    const loaded = await service.load();

    expect(loaded).toEqual(DEFAULT_RISK_POLICY);
    expect(repo.save).toHaveBeenCalledWith(DEFAULT_RISK_POLICY);
    expect(service.getPolicy()).toEqual(DEFAULT_RISK_POLICY);
  });

  it('loads the persisted policy when one exists', async () => {
    const persisted = { ...DEFAULT_RISK_POLICY, maxOpenTrades: 7 };
    const repo = repository(persisted);
    const service = new RiskPolicyService(repo, new FakeClock());

    const loaded = await service.load();

    expect(loaded.maxOpenTrades).toBe(7);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('merges a partial patch onto the current policy and persists the result', async () => {
    const repo = repository(null);
    const service = new RiskPolicyService(repo, new FakeClock());
    await service.load();

    const updated = await service.updatePolicy({ maxOpenTrades: 10 });

    expect(updated.maxOpenTrades).toBe(10);
    expect(updated.maxDailyLoss).toBe(DEFAULT_RISK_POLICY.maxDailyLoss);
    expect(service.getPolicy().maxOpenTrades).toBe(10);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ maxOpenTrades: 10 }),
    );
  });

  it('stamps updatedAt on every update', async () => {
    const repo = repository(null);
    const clock = new FakeClock();
    const service = new RiskPolicyService(repo, clock);
    await service.load();

    const updated = await service.updatePolicy({ maxOpenTrades: 2 });

    expect(updated.updatedAt).not.toBe(DEFAULT_RISK_POLICY.updatedAt);
  });
});
