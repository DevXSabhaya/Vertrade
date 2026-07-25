import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { MarketPriceUpdatedEvent } from '@shared/events/market-price-updated.event';
import {
  calculateUnrealizedPnl,
  calculateBookedPnl,
} from '@modules/trading-engine/domain/pnl.util';
import type { TradeSnapshot } from '@modules/trading-engine/domain/trade-snapshot';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import type { PnlSnapshot } from './models/pnl-snapshot.model';

/**
 * Owns exactly one piece of state: the last observed tick price per
 * instrument (Market Data, Phase 6, only ever forwards the latest tick —
 * nothing upstream persists a price history, so "last known price" is as
 * much history as this system has). Every PnL figure is computed fresh from
 * a `TradeSnapshot` plus that cached price — never stored, never stale
 * beyond the last tick actually observed.
 */
@Injectable()
export class PnLService implements OnModuleInit {
  private readonly lastPriceByToken = new Map<string, number>();

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<MarketPriceUpdatedEvent>(
      MarketPriceUpdatedEvent.EVENT_NAME,
      (event) => {
        this.lastPriceByToken.set(event.instrumentToken, event.price);
      },
    );
  }

  getMarkPrice(instrumentToken: string): number | null {
    return this.lastPriceByToken.get(instrumentToken) ?? null;
  }

  compute(snapshot: TradeSnapshot): PnlSnapshot {
    const markPrice = this.getMarkPrice(snapshot.instrumentToken);

    const livePnl =
      markPrice === null
        ? null
        : calculateUnrealizedPnl(
            snapshot.direction,
            snapshot.entryFillPrice,
            snapshot.filledQuantity,
            snapshot.openQuantity,
            markPrice,
          );

    const bookedPnl = calculateBookedPnl(
      snapshot.direction,
      snapshot.entryFillPrice,
      snapshot.exitProceeds,
      snapshot.exitedQuantity,
    );

    const mtm =
      livePnl === null && bookedPnl === null
        ? null
        : (livePnl ?? 0) + (bookedPnl ?? 0);

    const directionSign = snapshot.direction === TradeDirection.LONG ? 1 : -1;
    const points =
      markPrice === null || snapshot.entryFillPrice === null
        ? null
        : directionSign * (markPrice - snapshot.entryFillPrice);

    const percentage =
      points === null || snapshot.entryFillPrice === null
        ? null
        : (points / snapshot.entryFillPrice) * 100;

    return {
      tradeId: snapshot.id,
      livePnl,
      bookedPnl,
      mtm,
      points,
      percentage,
      markPrice,
      asOf: this.clock.now().toISOString(),
    };
  }
}
