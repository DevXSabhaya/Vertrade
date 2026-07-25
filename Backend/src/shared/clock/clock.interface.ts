/**
 * Every timestamp the Trading Engine records goes through this abstraction —
 * never a direct `new Date()` call in domain code — so tests can supply a
 * fully deterministic, controllable notion of "now" instead of depending on
 * real wall-clock time.
 */
export interface IClock {
  now(): Date;
}
