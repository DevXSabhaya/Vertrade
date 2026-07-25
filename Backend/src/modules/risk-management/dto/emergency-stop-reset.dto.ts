import { IsOptional, IsString } from 'class-validator';

export class EmergencyStopResetDto {
  @IsOptional()
  @IsString()
  resetBy?: string;
}
