import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TradingEngineModule } from '@modules/trading-engine/trading-engine.module';
import { TradeLifecycleModule } from '@modules/trade-lifecycle/trade-lifecycle.module';
import { AuthModule } from '@modules/auth/auth.module';
import { CLOCK } from '@shared/clock/clock.constants';
import { SystemClock } from '@shared/clock/system-clock';
import { RiskPolicyService } from './risk-policy.service';
import { DailyRiskStateService } from './daily-risk-state.service';
import { CooldownService } from './cooldown.service';
import { KillSwitchService } from './kill-switch.service';
import { EmergencyStopService } from './emergency-stop.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ExposureCapitalService } from './exposure-capital.service';
import { RiskSnapshotService } from './risk-snapshot.service';
import { RiskEvaluationService } from './risk-evaluation.service';
import { RiskEventPublisher } from './risk-event-publisher';
import { RiskEventRecorderService } from './risk-event-recorder.service';
import { RiskManagementController } from './risk-management.controller';
import {
  COOLDOWN_STATE_REPOSITORY,
  DAILY_RISK_STATE_REPOSITORY,
  EMERGENCY_STOP_STATE_REPOSITORY,
  KILL_SWITCH_STATE_REPOSITORY,
  RISK_EVENT_REPOSITORY,
  RISK_POLICY_REPOSITORY,
  RISK_VIOLATION_REPOSITORY,
} from './risk-management.constants';
import {
  RiskPolicyDocumentSchema,
  RiskPolicyMongooseSchema,
} from './repository/risk-policy.schema';
import { RiskPolicyRepository } from './repository/risk-policy.repository';
import {
  DailyRiskStateDocumentSchema,
  DailyRiskStateMongooseSchema,
} from './repository/daily-risk-state.schema';
import { DailyRiskStateRepository } from './repository/daily-risk-state.repository';
import {
  CooldownStateDocumentSchema,
  CooldownStateMongooseSchema,
} from './repository/cooldown-state.schema';
import { CooldownStateRepository } from './repository/cooldown-state.repository';
import {
  KillSwitchStateDocumentSchema,
  KillSwitchStateMongooseSchema,
} from './repository/kill-switch-state.schema';
import { KillSwitchStateRepository } from './repository/kill-switch-state.repository';
import {
  EmergencyStopStateDocumentSchema,
  EmergencyStopStateMongooseSchema,
} from './repository/emergency-stop-state.schema';
import { EmergencyStopStateRepository } from './repository/emergency-stop-state.repository';
import {
  RiskEventDocumentSchema,
  RiskEventMongooseSchema,
} from './repository/risk-event.schema';
import { RiskEventRepository } from './repository/risk-event.repository';
import {
  RiskViolationDocumentSchema,
  RiskViolationMongooseSchema,
} from './repository/risk-violation.schema';
import { RiskViolationRepository } from './repository/risk-violation.repository';

/**
 * Phase 11 — the Risk Management Engine. Sits strictly "below"
 * `TradeValidationModule`/`SchedulerModule`/`RecoveryModule` in the
 * dependency graph (they import this module; this module never imports any
 * of them back) — the same DAG discipline `BrokerHealthModule` and
 * `SchedulerModule` already established in Phase 8. Reads trades and
 * positions through `TradingEngineModule`/`TradeLifecycleModule` — never a
 * second Trading Engine, never a second Trade Aggregate, never a
 * duplicated read of what those modules already compute correctly.
 */
@Module({
  imports: [
    TradingEngineModule,
    TradeLifecycleModule,
    AuthModule,
    MongooseModule.forFeature([
      { name: RiskPolicyDocumentSchema.name, schema: RiskPolicyMongooseSchema },
      {
        name: DailyRiskStateDocumentSchema.name,
        schema: DailyRiskStateMongooseSchema,
      },
      {
        name: CooldownStateDocumentSchema.name,
        schema: CooldownStateMongooseSchema,
      },
      {
        name: KillSwitchStateDocumentSchema.name,
        schema: KillSwitchStateMongooseSchema,
      },
      {
        name: EmergencyStopStateDocumentSchema.name,
        schema: EmergencyStopStateMongooseSchema,
      },
      { name: RiskEventDocumentSchema.name, schema: RiskEventMongooseSchema },
      {
        name: RiskViolationDocumentSchema.name,
        schema: RiskViolationMongooseSchema,
      },
    ]),
  ],
  controllers: [RiskManagementController],
  providers: [
    RiskPolicyService,
    DailyRiskStateService,
    CooldownService,
    KillSwitchService,
    EmergencyStopService,
    CircuitBreakerService,
    ExposureCapitalService,
    RiskSnapshotService,
    RiskEvaluationService,
    RiskEventPublisher,
    RiskEventRecorderService,
    { provide: CLOCK, useClass: SystemClock },
    { provide: RISK_POLICY_REPOSITORY, useClass: RiskPolicyRepository },
    {
      provide: DAILY_RISK_STATE_REPOSITORY,
      useClass: DailyRiskStateRepository,
    },
    { provide: COOLDOWN_STATE_REPOSITORY, useClass: CooldownStateRepository },
    {
      provide: KILL_SWITCH_STATE_REPOSITORY,
      useClass: KillSwitchStateRepository,
    },
    {
      provide: EMERGENCY_STOP_STATE_REPOSITORY,
      useClass: EmergencyStopStateRepository,
    },
    { provide: RISK_EVENT_REPOSITORY, useClass: RiskEventRepository },
    { provide: RISK_VIOLATION_REPOSITORY, useClass: RiskViolationRepository },
  ],
  exports: [
    RiskPolicyService,
    RiskEvaluationService,
    RiskSnapshotService,
    KillSwitchService,
    EmergencyStopService,
    CooldownService,
    CircuitBreakerService,
    DailyRiskStateService,
  ],
})
export class RiskManagementModule {}
