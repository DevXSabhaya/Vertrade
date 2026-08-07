import { IsIn, IsOptional, IsString } from 'class-validator';

export class SetTradingModeDto {
  @IsIn(['PAPER', 'LIVE'])
  mode!: 'PAPER' | 'LIVE';

  /** Required when `mode` is 'LIVE' — the caller's own broker account to trade through. Ignored for 'PAPER'. */
  @IsOptional()
  @IsString()
  brokerAccountId?: string;
}
