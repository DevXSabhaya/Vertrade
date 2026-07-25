import { Injectable } from '@nestjs/common';
import { MarketDataInstrument } from '../models/market-data-instrument.model';

export interface AddSubscriberResult {
  /** True the first time any subscriber wants this instrument — the only
   * time the broker actually needs a subscribe request sent. */
  readonly isNewInstrument: boolean;
  readonly subscriberCount: number;
}

export interface RemoveSubscriberResult {
  /** True once the last subscriber for this instrument is gone — the only
   * time the broker actually needs an unsubscribe request sent. */
  readonly isFullyUnsubscribed: boolean;
  readonly subscriberCount: number;
}

/**
 * Reference-counted subscription bookkeeping, decoupled from any broker or
 * provider: many callers (multiple active trades on the same instrument,
 * future dashboard widgets, etc.) can each subscribe to the same instrument
 * token, and the broker only ever sees one subscribe/unsubscribe pair for it
 * — never a duplicate request, and never dropped while anyone still needs it.
 */
@Injectable()
export class SubscriptionManager {
  private readonly subscribers = new Map<string, Set<string>>();
  private readonly instruments = new Map<string, MarketDataInstrument>();

  addSubscriber(
    instrument: MarketDataInstrument,
    subscriberId: string,
  ): AddSubscriberResult {
    const existing = this.subscribers.get(instrument.instrumentToken);
    const isNewInstrument = existing === undefined || existing.size === 0;
    const subscriberSet = existing ?? new Set<string>();

    subscriberSet.add(subscriberId);
    this.subscribers.set(instrument.instrumentToken, subscriberSet);
    this.instruments.set(instrument.instrumentToken, instrument);

    return { isNewInstrument, subscriberCount: subscriberSet.size };
  }

  removeSubscriber(
    instrumentToken: string,
    subscriberId: string,
  ): RemoveSubscriberResult {
    const subscriberSet = this.subscribers.get(instrumentToken);
    if (!subscriberSet) {
      return { isFullyUnsubscribed: false, subscriberCount: 0 };
    }

    subscriberSet.delete(subscriberId);

    if (subscriberSet.size === 0) {
      this.subscribers.delete(instrumentToken);
      this.instruments.delete(instrumentToken);
      return { isFullyUnsubscribed: true, subscriberCount: 0 };
    }

    return { isFullyUnsubscribed: false, subscriberCount: subscriberSet.size };
  }

  getInstrument(instrumentToken: string): MarketDataInstrument | undefined {
    return this.instruments.get(instrumentToken);
  }

  getSubscriberCount(instrumentToken: string): number {
    return this.subscribers.get(instrumentToken)?.size ?? 0;
  }

  isSubscribed(instrumentToken: string): boolean {
    return this.getSubscriberCount(instrumentToken) > 0;
  }

  getSubscribedInstruments(): MarketDataInstrument[] {
    return Array.from(this.instruments.values());
  }

  count(): number {
    return this.instruments.size;
  }
}
