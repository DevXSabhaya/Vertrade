export const RISK_POLICY_REPOSITORY = Symbol('RISK_POLICY_REPOSITORY');
export const DAILY_RISK_STATE_REPOSITORY = Symbol(
  'DAILY_RISK_STATE_REPOSITORY',
);
export const COOLDOWN_STATE_REPOSITORY = Symbol('COOLDOWN_STATE_REPOSITORY');
export const KILL_SWITCH_STATE_REPOSITORY = Symbol(
  'KILL_SWITCH_STATE_REPOSITORY',
);
export const EMERGENCY_STOP_STATE_REPOSITORY = Symbol(
  'EMERGENCY_STOP_STATE_REPOSITORY',
);
export const RISK_EVENT_REPOSITORY = Symbol('RISK_EVENT_REPOSITORY');
export const RISK_VIOLATION_REPOSITORY = Symbol('RISK_VIOLATION_REPOSITORY');

/** Runtime-toggleable override, off by default is NOT the goal here — Risk Management is a first-class protection layer per the spec, so this flag exists only as an emergency escape hatch (e.g. to unblock trading while a policy misconfiguration is fixed), not as the normal on/off switch. Absent from the feature flag store, `FeatureFlagsService.isEnabled()` defaults to `false` — so this rule treats "flag not set" as "enabled" (inverted default), consistent with a protection layer that must fail safe. */
export const RISK_MANAGEMENT_DISABLED_FLAG = 'RISK_MANAGEMENT_DISABLED';
