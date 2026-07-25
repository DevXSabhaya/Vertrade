import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { IHealthSnapshotRepository } from '../interfaces/health-snapshot-repository.interface';
import type { HealthSnapshot } from '../models/health-snapshot.model';
import {
  HealthSnapshotDocumentSchema,
  type HealthSnapshotDocument,
} from './health-snapshot.schema';

@Injectable()
export class HealthSnapshotRepository implements IHealthSnapshotRepository {
  constructor(
    @InjectModel(HealthSnapshotDocumentSchema.name)
    private readonly model: Model<HealthSnapshotDocument>,
  ) {}

  async save(snapshot: HealthSnapshot): Promise<void> {
    await this.model.create({ ...snapshot });
  }

  async findLatest(): Promise<HealthSnapshot | null> {
    const doc = await this.model.findOne().sort({ timestamp: -1 }).exec();
    return doc ? this.toSnapshot(doc) : null;
  }

  private toSnapshot(doc: HealthSnapshotDocument): HealthSnapshot {
    return {
      timestamp: doc.timestamp,
      overallStatus: doc.overallStatus,
      brokerStatus: doc.brokerStatus,
      restApiStatus: doc.restApiStatus,
      websocketStatus: doc.websocketStatus,
      marketDataStatus: doc.marketDataStatus,
      authStatus: doc.authStatus,
      schedulerStatus: doc.schedulerStatus,
      databaseStatus: doc.databaseStatus,
      queueStatus: doc.queueStatus,
      latency: doc.latency,
      heartbeatAge: doc.heartbeatAge,
      lastSuccessfulRequest: doc.lastSuccessfulRequest,
      activeSubscriptions: doc.activeSubscriptions,
      connectedSince: doc.connectedSince,
    };
  }
}
