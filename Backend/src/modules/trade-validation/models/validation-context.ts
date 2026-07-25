import type { ResolvedInstrument } from '@modules/instrument-resolver/resolved-instrument.vo';
import type { TradeValidationRequest } from './trade-validation-request.model';

/**
 * Threaded through the pipeline, rule by rule. Rules only ever add fields
 * (e.g. InstrumentExistsRule sets `resolvedInstrument` for every rule after
 * it to read) — never remove or overwrite what an earlier rule established.
 */
export class ValidationContext {
  resolvedInstrument?: ResolvedInstrument;

  constructor(public readonly request: TradeValidationRequest) {}
}
