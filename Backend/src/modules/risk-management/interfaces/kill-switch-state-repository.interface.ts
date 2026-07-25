import type { KillSwitchState } from '../models/kill-switch-state.model';

export interface IKillSwitchStateRepository {
  save(state: KillSwitchState): Promise<void>;
  find(): Promise<KillSwitchState | null>;
}
