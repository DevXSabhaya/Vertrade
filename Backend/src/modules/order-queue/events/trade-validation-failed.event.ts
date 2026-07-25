import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { ValidationFailure } from '@modules/trade-validation/models/validation-failure.model';

export class TradeValidationFailedEvent extends DomainEvent {
  readonly eventName = 'order-queue.trade.validation-failed';

  constructor(
    public readonly rawSymbol: string,
    public readonly failure: ValidationFailure,
  ) {
    super();
  }
}
