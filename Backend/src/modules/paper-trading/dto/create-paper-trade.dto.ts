import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { TrailingConfigurationDto } from './trailing-configuration.dto';

export class CreatePaperTradeDto {
  @IsString()
  @MinLength(1)
  rawSymbol!: string;

  @IsEnum(TradeDirection)
  direction!: TradeDirection;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  /**
   * Always required, even for a market order: it's the estimated fill price
   * used for margin reservation/risk sizing before the real fill price is
   * known. When `isMarketOrder` is true, the actual entry fires on the very
   * next market tick (see `TradingEngineService.evaluateEntry`) rather than
   * waiting for price to cross this value.
   */
  @IsNumber()
  @IsPositive()
  entryTriggerPrice!: number;

  @IsNumber()
  @IsPositive()
  initialStopLoss!: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  targets!: number[];

  /** When true, entry fires on the next tick regardless of `entryTriggerPrice` — a genuine market order rather than a triggered/conditional entry. Defaults to false (existing trigger-price-gated behavior, unchanged). */
  @IsOptional()
  @IsBoolean()
  isMarketOrder?: boolean;

  /** Optional trailing-stop configuration, activated once the trade is OPEN via the same TradeExtensionStore mechanism TrailingManager already uses. Omitted entirely means no trailing — unchanged default behavior. */
  @IsOptional()
  @ValidateNested()
  @Type(() => TrailingConfigurationDto)
  trailingConfig?: TrailingConfigurationDto;

  /**
   * Only meaningful when this deployment's TRADING_MODE is LIVE — ignored
   * entirely for PAPER (PaperExecutor never reads it). Required, in addition
   * to the LIVE_TRADING_ENABLED feature flag and a HEALTHY broker snapshot,
   * before AngelOneExecutor will place a real entry order
   * (LiveOrderSafetyGateService.checkEntryAllowed); omitting it — the
   * default — means a live order is always blocked, never silently routed
   * to paper.
   */
  @IsOptional()
  @IsBoolean()
  liveTradingConfirmed?: boolean;
}
