import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PaperTradeStatus } from '../models/paper-trade-status.enum';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';

export class GetTradeHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsIn([
    PaperTradeStatus.OPEN,
    PaperTradeStatus.CLOSED,
    PaperTradeStatus.FAILED,
    PaperTradeStatus.CANCELLED,
  ])
  status?: PaperTradeStatus;

  @IsOptional()
  @IsEnum(TradeDirection)
  side?: TradeDirection;

  @IsOptional()
  @IsString()
  instrument?: string;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}
