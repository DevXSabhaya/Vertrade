import type { IReconciliationReportRepository } from '../interfaces/reconciliation-report-repository.interface';
import type { ReconciliationReport } from '../models/reconciliation-report.model';

export class FakeReconciliationReportRepository implements IReconciliationReportRepository {
  private readonly byId = new Map<string, ReconciliationReport>();

  save(report: ReconciliationReport): Promise<void> {
    this.byId.set(report.id, report);
    return Promise.resolve();
  }

  findRecent(limit: number): Promise<ReconciliationReport[]> {
    return Promise.resolve(
      Array.from(this.byId.values())
        .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
        .slice(0, limit),
    );
  }

  findLatest(): Promise<ReconciliationReport | null> {
    const all = Array.from(this.byId.values()).sort((a, b) =>
      b.generatedAt.localeCompare(a.generatedAt),
    );
    return Promise.resolve(all[0] ?? null);
  }
}
