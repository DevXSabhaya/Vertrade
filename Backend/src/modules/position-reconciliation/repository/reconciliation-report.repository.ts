import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { IReconciliationReportRepository } from '../interfaces/reconciliation-report-repository.interface';
import type { ReconciliationReport } from '../models/reconciliation-report.model';
import {
  ReconciliationReportDocumentSchema,
  type ReconciliationReportDocument,
} from './reconciliation-report.schema';

@Injectable()
export class ReconciliationReportRepository implements IReconciliationReportRepository {
  constructor(
    @InjectModel(ReconciliationReportDocumentSchema.name)
    private readonly model: Model<ReconciliationReportDocument>,
  ) {}

  async save(report: ReconciliationReport): Promise<void> {
    await this.model
      .updateOne(
        { reportId: report.id },
        {
          $set: {
            reportId: report.id,
            tradeId: report.tradeId,
            generatedAt: report.generatedAt,
            mismatches: report.mismatches,
            overallLevel: report.overallLevel,
            autoRepaired: report.autoRepaired,
            manualReviewRequired: report.manualReviewRequired,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async findRecent(limit: number): Promise<ReconciliationReport[]> {
    const docs = await this.model
      .find()
      .sort({ generatedAt: -1 })
      .limit(limit)
      .exec();
    return docs.map((doc) => this.toReport(doc));
  }

  async findLatest(): Promise<ReconciliationReport | null> {
    const doc = await this.model.findOne().sort({ generatedAt: -1 }).exec();
    return doc ? this.toReport(doc) : null;
  }

  private toReport(doc: ReconciliationReportDocument): ReconciliationReport {
    return {
      id: doc.reportId,
      tradeId: doc.tradeId,
      generatedAt: doc.generatedAt,
      mismatches: doc.mismatches,
      overallLevel: doc.overallLevel,
      autoRepaired: doc.autoRepaired,
      manualReviewRequired: doc.manualReviewRequired,
    };
  }
}
