import { Inject, Injectable } from '@nestjs/common';
import type { IValidationRule } from './interfaces/validation-rule.interface';
import { VALIDATION_RULES } from './trade-validation.constants';

/**
 * The ordered collection of active validation rules. TradeValidationService
 * depends only on this class, never on any individual rule — adding a new
 * rule later means adding one line to TradeValidationModule's VALIDATION_RULES
 * provider array, never touching this class or TradeValidationService
 * (Open/Closed Principle).
 */
@Injectable()
export class RuleRegistry {
  constructor(
    @Inject(VALIDATION_RULES) private readonly rules: IValidationRule[],
  ) {}

  getRules(): readonly IValidationRule[] {
    return this.rules;
  }
}
