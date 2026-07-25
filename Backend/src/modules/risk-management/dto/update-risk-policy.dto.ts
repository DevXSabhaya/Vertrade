import { IsBoolean, IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import {
  DailyLossBreachAction,
  DailyLossLimitType,
  DuplicateInstrumentPolicy,
} from '../models/risk-policy.model';

/** Every field optional — `PUT /risk/policy` merges the supplied fields onto the current policy rather than requiring a full replacement payload. */
export class UpdateRiskPolicyDto {
  @IsOptional() @IsNumber() @Min(0) maxDailyLoss?: number;
  @IsOptional()
  @IsEnum(DailyLossLimitType)
  maxDailyLossType?: DailyLossLimitType;
  @IsOptional() @IsNumber() @Min(0) dailyRiskCapital?: number;
  @IsOptional()
  @IsEnum(DailyLossBreachAction)
  dailyLossBreachAction?: DailyLossBreachAction;

  @IsOptional() @IsNumber() @Min(0) maxOpenTrades?: number;

  @IsOptional() @IsNumber() @Min(0) maxQuantityPerTrade?: number;
  @IsOptional() @IsNumber() @Min(0) maxQuantityPerInstrument?: number;
  @IsOptional() @IsNumber() @Min(0) maxQuantityGlobal?: number;

  @IsOptional() @IsNumber() @Min(0) maxExposurePerTrade?: number;
  @IsOptional() @IsNumber() @Min(0) maxExposurePerInstrument?: number;
  @IsOptional() @IsNumber() @Min(0) maxTotalExposure?: number;

  @IsOptional() @IsNumber() @Min(0) maxCapitalPerTrade?: number;
  @IsOptional() @IsNumber() @Min(0) maxCapitalPerInstrument?: number;
  @IsOptional() @IsNumber() @Min(0) maxTotalDeployedCapital?: number;
  @IsOptional() @IsNumber() @Min(0) maxPercentageOfAvailableCapital?: number;
  @IsOptional() @IsNumber() @Min(0) availableCapital?: number;

  @IsOptional() @IsNumber() @Min(0) maxRiskPerTrade?: number;
  @IsOptional() @IsNumber() @Min(0) maxRiskPerTradePercentage?: number;

  @IsOptional()
  @IsEnum(DuplicateInstrumentPolicy)
  duplicateInstrumentPolicy?: DuplicateInstrumentPolicy;

  @IsOptional() @IsNumber() @Min(0) cooldownAfterLossMs?: number;
  @IsOptional() @IsNumber() @Min(0) cooldownAfterDailyLossMs?: number;
  @IsOptional() @IsNumber() @Min(0) cooldownAfterConsecutiveLossesMs?: number;
  @IsOptional() @IsNumber() @Min(0) cooldownAfterEmergencyExitMs?: number;

  @IsOptional() @IsNumber() @Min(0) maxConsecutiveLosses?: number;

  @IsOptional() @IsBoolean() killSwitchEnabled?: boolean;
  @IsOptional() @IsBoolean() killSwitchForceExitsPositions?: boolean;

  @IsOptional() @IsNumber() @Min(1) circuitBreakerFailureThreshold?: number;
  @IsOptional() @IsNumber() @Min(0) circuitBreakerOpenDurationMs?: number;
}
