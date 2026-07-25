import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import {
  DailyLossBreachAction,
  DailyLossLimitType,
  DuplicateInstrumentPolicy,
} from '../models/risk-policy.model';

/** Singleton document (`singletonId` always `'default'`) — one policy for the whole system, matching the spec's single `RiskPolicy` example. */
@Schema({ collection: 'riskPolicy' })
export class RiskPolicyDocumentSchema {
  @Prop({ required: true, unique: true, default: 'default' })
  singletonId!: string;

  @Prop({ required: true }) maxDailyLoss!: number;
  @Prop({ required: true, type: String, enum: DailyLossLimitType })
  maxDailyLossType!: DailyLossLimitType;
  @Prop({ required: true }) dailyRiskCapital!: number;
  @Prop({ required: true, type: String, enum: DailyLossBreachAction })
  dailyLossBreachAction!: DailyLossBreachAction;

  @Prop({ required: true }) maxOpenTrades!: number;

  @Prop({ required: true }) maxQuantityPerTrade!: number;
  @Prop({ required: true }) maxQuantityPerInstrument!: number;
  @Prop({ required: true }) maxQuantityGlobal!: number;

  @Prop({ required: true }) maxExposurePerTrade!: number;
  @Prop({ required: true }) maxExposurePerInstrument!: number;
  @Prop({ required: true }) maxTotalExposure!: number;

  @Prop({ required: true }) maxCapitalPerTrade!: number;
  @Prop({ required: true }) maxCapitalPerInstrument!: number;
  @Prop({ required: true }) maxTotalDeployedCapital!: number;
  @Prop({ required: true }) maxPercentageOfAvailableCapital!: number;
  @Prop({ required: true }) availableCapital!: number;

  @Prop({ required: true }) maxRiskPerTrade!: number;
  @Prop({ required: true }) maxRiskPerTradePercentage!: number;

  @Prop({ required: true, type: String, enum: DuplicateInstrumentPolicy })
  duplicateInstrumentPolicy!: DuplicateInstrumentPolicy;

  @Prop({ required: true }) cooldownAfterLossMs!: number;
  @Prop({ required: true }) cooldownAfterDailyLossMs!: number;
  @Prop({ required: true }) cooldownAfterConsecutiveLossesMs!: number;
  @Prop({ required: true }) cooldownAfterEmergencyExitMs!: number;

  @Prop({ required: true }) maxConsecutiveLosses!: number;

  @Prop({ required: true }) killSwitchEnabled!: boolean;
  @Prop({ required: true }) killSwitchForceExitsPositions!: boolean;

  @Prop({ required: true }) circuitBreakerFailureThreshold!: number;
  @Prop({ required: true }) circuitBreakerOpenDurationMs!: number;

  @Prop({ required: true }) updatedAt!: string;
}

export type RiskPolicyDocument = HydratedDocument<RiskPolicyDocumentSchema>;
export const RiskPolicyMongooseSchema = SchemaFactory.createForClass(
  RiskPolicyDocumentSchema,
);
