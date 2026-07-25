import { IsEnum, IsNumber, IsOptional, IsPositive } from 'class-validator';
import { TrailingStrategy } from '@modules/trade-lifecycle/models/trailing-strategy.enum';

/** Mirrors `TrailingConfiguration` (trade-lifecycle) as an input-validated shape — only the field(s) relevant to `strategy` are ever read downstream. */
export class TrailingConfigurationDto {
  @IsEnum(TrailingStrategy)
  strategy!: TrailingStrategy;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  fixedPoints?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  percentage?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  stepSize?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  atrMultiplier?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  lockProfitPoints?: number;
}
