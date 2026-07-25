import type { CooldownState } from '../models/cooldown.model';

export interface ICooldownStateRepository {
  save(state: CooldownState | null): Promise<void>;
  find(): Promise<CooldownState | null>;
}
