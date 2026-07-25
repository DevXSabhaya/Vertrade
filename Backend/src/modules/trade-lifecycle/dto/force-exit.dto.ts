import { IsString, IsNotEmpty } from 'class-validator';

export class ForceExitDto {
  @IsString()
  @IsNotEmpty()
  tradeId!: string;
}
