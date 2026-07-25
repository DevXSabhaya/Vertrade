import type { IRepairActionRepository } from '../interfaces/repair-action-repository.interface';
import type { RepairAction } from '../models/repair-action.model';

export class FakeRepairActionRepository implements IRepairActionRepository {
  private readonly actions: RepairAction[] = [];

  save(action: RepairAction): Promise<void> {
    this.actions.push(action);
    return Promise.resolve();
  }

  findRecent(limit: number): Promise<RepairAction[]> {
    return Promise.resolve([...this.actions].reverse().slice(0, limit));
  }

  all(): readonly RepairAction[] {
    return this.actions;
  }
}
