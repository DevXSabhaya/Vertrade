import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class EmergencyStopDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsString()
  triggeredBy?: string;
}
