/**
 * Placeholder identity used everywhere the DB schema requires a userId, until
 * Phase 11 (Platform Authentication) introduces real, session-derived users.
 * The system is single-user until then — see the approved roadmap.
 */
export const SYSTEM_USER_ID = 'system';
