import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class TargetHitEvent extends DomainEvent {
  static readonly EVENT_NAME = 'trade.target.hit';
  readonly eventName = TargetHitEvent.EVENT_NAME;

  constructor(
    public readonly tradeId: string,
    public readonly targetPrice: number,
    public readonly targetIndex: number,
    public readonly remainingTargetsCount: number,
  ) {
    super();
  }
}
