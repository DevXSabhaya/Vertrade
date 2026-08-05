export const BROKER_AUTH = Symbol('BROKER_AUTH');
export const BROKER_HTTP_CLIENT = Symbol('BROKER_HTTP_CLIENT');
export const BROKER_TOKEN_REPOSITORY = Symbol('BROKER_TOKEN_REPOSITORY');

/** Identifies Dhan among (eventually) multiple brokers in the brokerTokens collection. */
export const BROKER_NAME_DHAN = 'dhan';

/**
 * Which broker `BrokerSessionManager` currently manages a session for — the
 * seam that makes the class itself broker-independent (Core Architecture
 * Principle #10: future brokers must be pluggable without modifying
 * business logic). Bound to `BROKER_NAME_DHAN` today since Dhan is the only
 * broker with a real `IBrokerAuth` adapter; once the Broker Manager (backed
 * by `BrokerRegistry`/`BrokerAccountService`) can designate a different
 * broker as the single active one, this token's provider becomes the one
 * place that decision is threaded through, not a change to
 * `BrokerSessionManager` itself.
 */
export const ACTIVE_BROKER_NAME = Symbol('ACTIVE_BROKER_NAME');
