import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { KillSwitchStatus } from '../models/kill-switch-status.enum';

const ACTIVATABLE_STATUSES = [
  KillSwitchStatus.TRADING_DISABLED,
  KillSwitchStatus.EMERGENCY_STOP,
] as const;

export class KillSwitchActivateDto {
  /** Only `TRADING_DISABLED`/`EMERGENCY_STOP` may be activated into — `ACTIVE` is the normal state, reached only via `POST /risk/kill-switch/deactivate`. */
  @IsIn(ACTIVATABLE_STATUSES)
  status!: (typeof ACTIVATABLE_STATUSES)[number];

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsString()
  activatedBy?: string;

  @IsOptional()
  @IsBoolean()
  forceExitPositions?: boolean;
}
