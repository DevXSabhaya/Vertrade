import { Inject, Injectable } from '@nestjs/common';
import { RECONCILIATION_REPORT_REPOSITORY } from './position-reconciliation.constants';
import type { IReconciliationReportRepository } from './interfaces/reconciliation-report-repository.interface';
import type { ReconciliationReport } from './models/reconciliation-report.model';

@Injectable()
export class ReconciliationReporter {
  constructor(
    @Inject(RECONCILIATION_REPORT_REPOSITORY)
    private readonly repository: IReconciliationReportRepository,
  ) {}

  async persist(report: ReconciliationReport): Promise<void> {
    await this.repository.save(report);
  }

  async getLatest(): Promise<ReconciliationReport | null> {
    return this.repository.findLatest();
  }

  async getHistory(limit: number): Promise<ReconciliationReport[]> {
    return this.repository.findRecent(limit);
  }
}
