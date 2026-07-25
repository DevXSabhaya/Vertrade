import { IsString, IsNotEmpty } from 'class-validator';

export class ManualExitDto {
  @IsString()
  @IsNotEmpty()
  tradeId!: string;
}
