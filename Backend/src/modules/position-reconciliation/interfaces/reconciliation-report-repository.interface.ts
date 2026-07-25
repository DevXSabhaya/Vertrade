import type { ReconciliationReport } from '../models/reconciliation-report.model';

export interface IReconciliationReportRepository {
  save(report: ReconciliationReport): Promise<void>;
  findRecent(limit: number): Promise<ReconciliationReport[]>;
  findLatest(): Promise<ReconciliationReport | null>;
}
