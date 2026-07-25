import { Injectable } from '@nestjs/common';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { TradeStateTransitions } from '@modules/trading-engine/domain/trade-state-transitions';
import type { LocalPositionView } from './models/local-position-view.model';

/**
 * The Engine's own side of the comparison — every non-terminal trade,
 * mapped from its TradeSnapshot into the broker-comparable shape
 * MismatchDetector works with. Terminal trades (COMPLETED/CANCELLED/
 * REJECTED/FAILED/ERROR) hold no live broker position, so they are excluded
 * — there is nothing left to reconcile.
 */
@Injectable()
export class LocalPositionProvider {
  constructor(private readonly tradingEngineService: TradingEngineService) {}

  getOpenPositions(): LocalPositionView[] {
    return this.tradingEngineService
      .getAllTrades()
      .filter((trade) => !TradeStateTransitions.isTerminal(trade.state))
      .map((trade) => ({
        tradeId: trade.id,
        tradingSymbol: trade.tradingSymbol,
        exchange: trade.exchange,
        instrumentToken: trade.instrumentToken,
        side: trade.direction,
        quantity: trade.quantity,
        filledQuantity: trade.filledQuantity,
        openQuantity: trade.openQuantity,
        averagePrice: trade.entryFillPrice,
        currentStopLoss: trade.currentStopLoss,
        targets: trade.targets,
        remainingTargets: trade.remainingTargets,
        tradeState: trade.state,
        entryOrderId: trade.entryOrderId,
        exitOrderId: trade.exitOrderId,
      }));
  }
}
