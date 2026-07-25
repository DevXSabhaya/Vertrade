import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PositionReconciliationService } from './position-reconciliation.service';
import type { ReconciliationReport } from './models/reconciliation-report.model';
import { ReconciliationReportNotFoundException } from './exceptions/reconciliation-report-not-found.exception';

/** Platform-wide reconciliation controls — same "any authenticated user, no admin role yet" caveat as RiskManagementController. */
@Controller('reconciliation')
@UseGuards(JwtAuthGuard)
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
