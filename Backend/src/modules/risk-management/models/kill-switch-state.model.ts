import { KillSwitchStatus } from './kill-switch-status.enum';

export interface KillSwitchState {
  readonly status: KillSwitchStatus;
  readonly reason: string | null;
  readonly activatedBy: string | null;
  readonly activatedAt: string | null;
  readonly deactivatedAt: string | null;
  readonly updatedAt: string;
}

export const DEFAULT_KILL_SWITCH_STATE: Omit<KillSwitchState, 'updatedAt'> = {
  status: KillSwitchStatus.ACTIVE,
  reason: null,
  activatedBy: null,
  activatedAt: null,
  deactivatedAt: null,
};
