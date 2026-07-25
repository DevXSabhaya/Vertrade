export const RECOVERY_HISTORY_REPOSITORY = Symbol(
  'RECOVERY_HISTORY_REPOSITORY',
);
export const RECOVERY_SNAPSHOT_REPOSITORY = Symbol(
  'RECOVERY_SNAPSHOT_REPOSITORY',
);
export const RECOVERY_ERROR_REPOSITORY = Symbol('RECOVERY_ERROR_REPOSITORY');
export const RECOVERY_CONFIG = Symbol('RECOVERY_CONFIG');

/** Gates whether RecoveryBootstrapService triggers a run automatically at boot. Defaults to disabled (FeatureFlagsService.isEnabled() is false until explicitly set). */
export const STARTUP_RECOVERY_ENABLED_FLAG = 'STARTUP_RECOVERY_ENABLED';
