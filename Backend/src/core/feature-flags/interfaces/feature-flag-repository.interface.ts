import type { IRepository } from '@shared/interfaces/repository.interface';
import type { FeatureFlag } from '../feature-flag.entity';

export interface IFeatureFlagRepository extends IRepository<FeatureFlag> {
  findByName(name: string): Promise<FeatureFlag | null>;
  upsert(name: string, enabled: boolean): Promise<FeatureFlag>;
}
