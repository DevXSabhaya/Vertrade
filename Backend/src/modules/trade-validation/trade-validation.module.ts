import { Module } from '@nestjs/common';
import { ConfigService } from '@core/config/config.service';
import { FeatureFlagsModule } from '@core/feature-flags/feature-flags.module';
import { InstrumentResolverModule } from '@modules/instrument-resolver/instrument-resolver.module';
import { TradingEngineModule } from '@modules/trading-engine/trading-engine.module';
import { RiskManagementModule } from '@modules/risk-management/risk-management.module';
import { CLOCK } from '@shared/clock/clock.constants';
import { SystemClock } from '@shared/clock/system-clock';
import { TradeValidationService } from './trade-validation.service';
import { RuleRegistry } from './rule-registry';
import {
  RISK_LIMITS_CONFIG,
  TRADING_HOURS_CONFIG,
  VALIDATION_RULES,
} from './trade-validation.constants';
import { DEFAULT_TRADING_HOURS } from './models/trading-hours.model';
import {
  DEFAULT_LIVE_RISK_LIMITS,
  DEFAULT_PAPER_RISK_LIMITS,
  type RiskLimitsConfig,
} from './models/risk-limits.model';
import { RequiredFieldsRule } from './rules/required-fields.rule';
import { InstrumentExistsRule } from './rules/instrument-exists.rule';
import { MarketOpenRule } from './rules/market-open.rule';
import { QuantityRule } from './rules/quantity.rule';
import { EntryPriceRule } from './rules/entry-price.rule';
import { StopLossRule } from './rules/stop-loss.rule';
import { TargetRule } from './rules/target.rule';
import { DuplicateTradeRule } from './rules/duplicate-trade.rule';
import { RiskRule } from './rules/risk.rule';
import { RiskManagementRule } from './rules/risk-management.rule';
import { FeatureFlagRule } from './rules/feature-flag.rule';
import type { IValidationRule } from './interfaces/validation-rule.interface';

const RULE_PROVIDERS = [
  RequiredFieldsRule,
  InstrumentExistsRule,
  MarketOpenRule,
  QuantityRule,
  EntryPriceRule,
  StopLossRule,
  TargetRule,
  DuplicateTradeRule,
  RiskRule,
  RiskManagementRule,
  FeatureFlagRule,
];

/**
 * The Trade Validation Engine: the Trading Engine must never receive a trade
 * that didn't pass through TradeValidationService.validate() first. Pipeline
 * order: Required Fields, Instrument Resolution, Market Session, Quantity,
 * Entry Price, Stop Loss, Target, Duplicate Active Trade, Risk (Phase 7's
 * simpler per-mode limits), Risk Management (Phase 11's full engine —
 * policy-driven exposure/capital/cooldown/kill-switch/circuit-breaker/
 * consecutive-loss protection), Feature Flag (the static kill switch).
 */
@Module({
  imports: [
    FeatureFlagsModule,
    InstrumentResolverModule,
    TradingEngineModule,
    RiskManagementModule,
  ],
  providers: [
    ...RULE_PROVIDERS,
    RuleRegistry,
    TradeValidationService,
    { provide: CLOCK, useClass: SystemClock },
    { provide: TRADING_HOURS_CONFIG, useValue: DEFAULT_TRADING_HOURS },
    {
      provide: RISK_LIMITS_CONFIG,
      useFactory: (configService: ConfigService): RiskLimitsConfig =>
        configService.tradingMode === 'LIVE'
          ? DEFAULT_LIVE_RISK_LIMITS
          : DEFAULT_PAPER_RISK_LIMITS,
      inject: [ConfigService],
    },
    {
      provide: VALIDATION_RULES,
      useFactory: (...rules: IValidationRule[]): IValidationRule[] => rules,
      inject: RULE_PROVIDERS,
    },
  ],
  exports: [TradeValidationService],
})
export class TradeValidationModule {}
