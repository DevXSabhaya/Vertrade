export enum CooldownReason {
  STOP_LOSS_HIT = 'STOP_LOSS_HIT',
  DAILY_LOSS = 'DAILY_LOSS',
  CONSECUTIVE_LOSSES = 'CONSECUTIVE_LOSSES',
  EMERGENCY_EXIT = 'EMERGENCY_EXIT',
}

/** `null` (no document / expired) means no cooldown is active. */
export interface CooldownState {
  readonly reason: CooldownReason;
  readonly startedAt: string;
  readonly expiresAt: string;
}
