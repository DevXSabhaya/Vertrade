import type { EmergencyStopState } from '../models/emergency-stop-state.model';

export interface IEmergencyStopStateRepository {
  save(state: EmergencyStopState): Promise<void>;
  find(): Promise<EmergencyStopState | null>;
}
