import { Injectable } from '@nestjs/common';
import { PositionManager } from '@modules/trade-lifecycle/position-manager.service';
import type { TradeRecord } from '@modules/trade-lifecycle/models/trade-record.model';
import { calculateExposure } from './domain/risk-calculations.util';
import type { OpenPositionView } from './domain/risk-evaluator';

/**
 * Reads open positions from Phase 10's `PositionManager` — never re-derives
 * them from `TradingEngineService` directly — so exposure/capital math is
 * always computed against the exact same composed `TradeRecord` the rest of
 * the system (the `/trades`, `/positions` APIs) already shows. This system
 * has no leverage/margin concept yet, so "capital used" and "notional
 * exposure" are the same figure (price × quantity) — documented here rather
 * than silently duplicated as two identical numbers with different names.
 */
@Injectable()
export class ExposureCapitalService {
  constructor(private readonly positionManager: PositionManager) {}

  async getOpenPositionViews(): Promise<OpenPositionView[]> {
    const positions = await this.positionManager.getActivePositions();
    return positions.map((record) => this.toView(record));
  }

  async getTotalExposure(): Promise<number> {
    const views = await this.getOpenPositionViews();
    return views.reduce((sum, v) => sum + v.exposure, 0);
  }

  async getUsedCapital(): Promise<number> {
    const views = await this.getOpenPositionViews();
    return views.reduce((sum, v) => sum + v.capitalUsed, 0);
  }

  private toView(record: TradeRecord): OpenPositionView {
    const price = record.averagePrice ?? record.entryPrice;
    const exposure = calculateExposure(
      price,
      record.openQuantity || record.quantity,
    );
    return {
      instrumentToken: record.token,
      direction: record.direction,
      quantity: record.openQuantity || record.quantity,
      exposure,
      capitalUsed: exposure,
    };
  }
}
