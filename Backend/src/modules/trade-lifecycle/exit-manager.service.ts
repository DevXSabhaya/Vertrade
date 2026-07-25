import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { ConfigService } from '@core/config/config.service';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { TradeStateTransitions } from '@modules/trading-engine/domain/trade-state-transitions';
import { StopLossHitEvent } from '@modules/trading-engine/events/stop-loss-hit.event';
import { TradeExtensionStore } from './trade-extension.store';
import { PnLService } from './pnl.service';
import { composeTradeRecord } from './domain/trade-record-composer';
import { ExitReason } from './models/exit-reason.enum';
import type { TradeRecord } from './models/trade-record.model';
import { ExitRequestedEvent, PositionClosedEvent } from './events';

/**
 * The single place every exit — automatic or human-triggered — is placed
 * from (Part "Exit Manager" of the Phase 10 spec). The tick-driven
 * stop-loss exit remains executed by `TradingEngineService`'s own private
 * tick evaluation (Phase 5, unchanged) since that path must stay
 * synchronous with price evaluation; this manager only *attributes* the
 * reason for it (subscribing to `StopLossHitEvent`) so the composed
 * `TradeRecord` reports `exitReason: STOPLOSS` once it completes. Every
 * other exit reason is genuinely placed here, through
 * `TradingEngineService.requestFullExit()`/`requestPartialExit()`.
 */
@Injectable()
export class ExitManager implements OnModuleInit {
  private readonly logger = new Logger(ExitManager.name);

  constructor(
    private readonly tradingEngineService: TradingEngineService,
    private readonly extensionStore: TradeExtensionStore,
    private readonly pnlService: PnLService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<StopLossHitEvent>(
      StopLossHitEvent.EVENT_NAME,
      (event) => {
        void this.extensionStore.patch(event.tradeId, {
          exitReason: ExitReason.STOPLOSS,
        });
      },
    );
  }

  async manualExit(tradeId: string): Promise<TradeRecord> {
    return this.exitWithReason(tradeId, ExitReason.MANUAL);
  }

  async forceExit(tradeId: string): Promise<TradeRecord> {
    return this.exitWithReason(tradeId, ExitReason.FORCE);
  }

  async marketCloseExit(tradeId: string): Promise<TradeRecord> {
    return this.exitWithReason(tradeId, ExitReason.MARKET_CLOSE);
  }

  async brokerDisconnectExit(tradeId: string): Promise<TradeRecord> {
    return this.exitWithReason(tradeId, ExitReason.BROKER_DISCONNECT);
  }

  /** Best-effort across every open position — one trade failing to exit never stops the rest from being attempted. */
  async emergencyExitAll(): Promise<TradeRecord[]> {
    const openTrades = this.tradingEngineService
      .getAllTrades()
      .filter((trade) => !TradeStateTransitions.isTerminal(trade.state));

    const results: TradeRecord[] = [];
    for (const trade of openTrades) {
      try {
        results.push(await this.exitWithReason(trade.id, ExitReason.EMERGENCY));
      } catch (error) {
        this.logger.error(
          `Emergency exit failed for trade ${trade.id}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }
    }
    return results;
  }

  async requestPartialExit(
    tradeId: string,
    quantity: number,
    reason: ExitReason,
  ): Promise<TradeRecord> {
    this.eventBus.publish(new ExitRequestedEvent(tradeId, quantity, reason));
    const extension = await this.extensionStore.patch(tradeId, {
      exitReason: reason,
    });

    const trade = this.tradingEngineService.getTrade(tradeId);
    const markPrice = this.resolveMarkPrice(
      trade.instrumentToken,
      trade.currentStopLoss,
    );
    const snapshot = await this.tradingEngineService.requestPartialExit(
      tradeId,
      quantity,
      markPrice,
    );

    if (snapshot.openQuantity === 0) {
      this.eventBus.publish(
        new PositionClosedEvent(tradeId, reason, snapshot.realizedPnl),
      );
    }

    return composeTradeRecord(
      snapshot,
      extension,
      markPrice,
      this.clock.now().getTime(),
      this.configService.tradingMode,
    );
  }

  private async exitWithReason(
    tradeId: string,
    reason: ExitReason,
  ): Promise<TradeRecord> {
    const trade = this.tradingEngineService.getTrade(tradeId);
    this.eventBus.publish(
      new ExitRequestedEvent(tradeId, trade.openQuantity, reason),
    );
    const extension = await this.extensionStore.patch(tradeId, {
      exitReason: reason,
    });

    const markPrice = this.resolveMarkPrice(
      trade.instrumentToken,
      trade.currentStopLoss,
    );
    const snapshot = await this.tradingEngineService.requestFullExit(
      tradeId,
      markPrice,
    );

    this.eventBus.publish(
      new PositionClosedEvent(tradeId, reason, snapshot.realizedPnl),
    );

    return composeTradeRecord(
      snapshot,
      extension,
      markPrice,
      this.clock.now().getTime(),
      this.configService.tradingMode,
    );
  }

  /** Falls back to the trade's own current stop loss when no tick has been observed for this instrument yet — a conservative, always-available estimate. */
  private resolveMarkPrice(instrumentToken: string, fallback: number): number {
    return this.pnlService.getMarkPrice(instrumentToken) ?? fallback;
  }
}
