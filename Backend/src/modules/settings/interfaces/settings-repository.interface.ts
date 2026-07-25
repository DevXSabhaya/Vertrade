import type { IRepository } from '@shared/interfaces/repository.interface';
import type { Setting } from '../settings.entity';

export interface ISettingsRepository extends IRepository<Setting> {
  findByKey(key: string): Promise<Setting | null>;
  upsert(key: string, value: unknown, updatedBy?: string): Promise<Setting>;
}
