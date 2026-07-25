import { IsOptional, IsString } from 'class-validator';

export class KillSwitchDeactivateDto {
  @IsOptional()
  @IsString()
  deactivatedBy?: string;
}
