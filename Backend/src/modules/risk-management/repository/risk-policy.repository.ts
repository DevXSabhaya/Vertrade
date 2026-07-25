import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { IRiskPolicyRepository } from '../interfaces/risk-policy-repository.interface';
import type { RiskPolicy } from '../models/risk-policy.model';
import {
  RiskPolicyDocumentSchema,
  type RiskPolicyDocument,
} from './risk-policy.schema';

const SINGLETON_ID = 'default';

@Injectable()
export class RiskPolicyRepository implements IRiskPolicyRepository {
  constructor(
    @InjectModel(RiskPolicyDocumentSchema.name)
    private readonly model: Model<RiskPolicyDocument>,
  ) {}

  async save(policy: RiskPolicy): Promise<void> {
    await this.model
      .updateOne(
        { singletonId: SINGLETON_ID },
        { $set: { singletonId: SINGLETON_ID, ...policy } },
        { upsert: true },
      )
      .exec();
  }

  async find(): Promise<RiskPolicy | null> {
    const doc = await this.model.findOne({ singletonId: SINGLETON_ID }).exec();
    return doc ? this.toPolicy(doc) : null;
  }

  private toPolicy(doc: RiskPolicyDocument): RiskPolicy {
    return {
      maxDailyLoss: doc.maxDailyLoss,
      maxDailyLossType: doc.maxDailyLossType,
      dailyRiskCapital: doc.dailyRiskCapital,
      dailyLossBreachAction: doc.dailyLossBreachAction,
      maxOpenTrades: doc.maxOpenTrades,
      maxQuantityPerTrade: doc.maxQuantityPerTrade,
      maxQuantityPerInstrument: doc.maxQuantityPerInstrument,
      maxQuantityGlobal: doc.maxQuantityGlobal,
      maxExposurePerTrade: doc.maxExposurePerTrade,
      maxExposurePerInstrument: doc.maxExposurePerInstrument,
      maxTotalExposure: doc.maxTotalExposure,
      maxCapitalPerTrade: doc.maxCapitalPerTrade,
      maxCapitalPerInstrument: doc.maxCapitalPerInstrument,
      maxTotalDeployedCapital: doc.maxTotalDeployedCapital,
      maxPercentageOfAvailableCapital: doc.maxPercentageOfAvailableCapital,
      availableCapital: doc.availableCapital,
      maxRiskPerTrade: doc.maxRiskPerTrade,
      maxRiskPerTradePercentage: doc.maxRiskPerTradePercentage,
      duplicateInstrumentPolicy: doc.duplicateInstrumentPolicy,
      cooldownAfterLossMs: doc.cooldownAfterLossMs,
      cooldownAfterDailyLossMs: doc.cooldownAfterDailyLossMs,
      cooldownAfterConsecutiveLossesMs: doc.cooldownAfterConsecutiveLossesMs,
      cooldownAfterEmergencyExitMs: doc.cooldownAfterEmergencyExitMs,
      maxConsecutiveLosses: doc.maxConsecutiveLosses,
      killSwitchEnabled: doc.killSwitchEnabled,
      killSwitchForceExitsPositions: doc.killSwitchForceExitsPositions,
      circuitBreakerFailureThreshold: doc.circuitBreakerFailureThreshold,
      circuitBreakerOpenDurationMs: doc.circuitBreakerOpenDurationMs,
      updatedAt: doc.updatedAt,
    };
  }
}
