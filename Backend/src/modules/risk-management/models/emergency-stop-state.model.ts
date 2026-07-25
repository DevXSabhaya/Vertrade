export interface EmergencyStopState {
  readonly active: boolean;
  readonly reason: string | null;
  readonly triggeredBy: string | null;
  readonly triggeredAt: string | null;
  readonly resetAt: string | null;
  readonly updatedAt: string;
}

export const DEFAULT_EMERGENCY_STOP_STATE: Omit<
  EmergencyStopState,
  'updatedAt'
> = {
  active: false,
  reason: null,
  triggeredBy: null,
  triggeredAt: null,
  resetAt: null,
};
