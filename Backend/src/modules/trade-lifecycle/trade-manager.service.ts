import { Inject, Injectable } from '@nestjs/common';
import { PositionManager } from './position-manager.service';
import { ExitManager } from './exit-manager.service';
import { TRADE_HISTORY_REPOSITORY } from './trade-lifecycle.constants';
import type { ITradeHistoryRepository } from './interfaces/trade-history-repository.interface';
import type { TradeRecord } from './models/trade-record.model';

/**
 * The single facade `TradesController`/`PositionsController` talk to —
 * every REST endpoint the Phase 10 spec lists maps to exactly one method
 * here. Keeps HTTP concerns out of `PositionManager`/`ExitManager`
 * themselves, the same separation Phase 9's `RecoveryService` /
 * `RecoveryController` use.
 */
@Injectable()
export class TradeManager {
  constructor(
    private readonly positionManager: PositionManager,
    private readonly exitManager: ExitManager,
    @Inject(TRADE_HISTORY_REPOSITORY)
    private readonly historyRepository: ITradeHistoryRepository,
  ) {}

  async getAllTrades(): Promise<TradeRecord[]> {
    return this.positionManager.getAllPositions();
  }

  async getTrade(tradeId: string): Promise<TradeRecord> {
    return this.positionManager.getPosition(tradeId);
  }

  async getActiveTrades(): Promise<TradeRecord[]> {
    return this.positionManager.getActivePositions();
  }

  async getHistory(limit = 50, offset = 0): Promise<TradeRecord[]> {
    return this.historyRepository.findAll(limit, offset);
  }

  async manualExit(tradeId: string): Promise<TradeRecord> {
    return this.exitManager.manualExit(tradeId);
  }

  async forceExit(tradeId: string): Promise<TradeRecord> {
    return this.exitManager.forceExit(tradeId);
  }
}
