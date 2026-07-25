import { AsyncLocalStorage } from 'node:async_hooks';

interface CorrelationContext {
  correlationId: string;
}

const asyncLocalStorage = new AsyncLocalStorage<CorrelationContext>();

/**
 * Static accessor over an AsyncLocalStorage context. Unlike request-scoped DI,
 * this remains readable from anywhere in the same async execution chain —
 * including event handlers and thrown exceptions — without needing a DI container.
 */
export class CorrelationIdStore {
  static run<T>(correlationId: string, callback: () => T): T {
    return asyncLocalStorage.run({ correlationId }, callback);
  }

  static getId(): string | undefined {
    return asyncLocalStorage.getStore()?.correlationId;
  }
}
