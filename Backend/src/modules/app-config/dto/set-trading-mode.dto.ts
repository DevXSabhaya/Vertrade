import { IsIn } from 'class-validator';

export class SetTradingModeDto {
  @IsIn(['PAPER', 'LIVE'])
  mode!: 'PAPER' | 'LIVE';
}
