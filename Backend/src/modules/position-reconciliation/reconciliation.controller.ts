import { Controller, Get, Post } from '@nestjs/common';
import { PositionReconciliationService } from './position-reconciliation.service';
import type { ReconciliationReport } from './models/reconciliation-report.model';
import { ReconciliationReportNotFoundException } from './exceptions/reconciliation-report-not-found.exception';

@Controller('reconciliation')
export class ReconciliationController {
  constructor(
    private readonly positionReconciliationService: PositionReconciliationService,
  ) {}

  @Post('run')
  async run(): Promise<ReconciliationReport[]> {
    return this.positionReconciliationService.reconcile();
  }

  @Get('report')
  async getLatest(): Promise<ReconciliationReport> {
    const report = await this.positionReconciliationService.getLatestReport();
    if (!report) {
      throw new ReconciliationReportNotFoundException(
        'No reconciliation report has been generated yet',
      );
    }
    return report;
  }

  @Get('history')
  async getHistory(): Promise<ReconciliationReport[]> {
    return this.positionReconciliationService.getHistory();
  }
}
