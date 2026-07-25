import type { HealthSnapshot } from '../models/health-snapshot.model';

export interface IHealthSnapshotRepository {
  save(snapshot: HealthSnapshot): Promise<void>;
  findLatest(): Promise<HealthSnapshot | null>;
}
