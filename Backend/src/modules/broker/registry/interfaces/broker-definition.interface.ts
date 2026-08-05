import type { IBrokerAuth } from '../../broker-auth/interfaces/broker-auth.interface';
import type { IOrderExecutor } from '../../executors/order-executor.interface';
import type { BrokerMetadata } from '../models/broker-metadata.model';

/**
 * One registry entry: everything the platform needs to offer a broker in
 * the Broker Manager and, once real, route order execution through it.
 * `auth`/`executor` are always present and always satisfy `IBrokerAuth`/
 * `IOrderExecutor` — for a not-yet-implemented broker they are bound to the
 * shared placeholder classes (see `placeholder/`), which throw a clear
 * `BrokerNotImplementedException` on every call. Nothing that consumes a
 * `BrokerDefinition` ever needs to branch on `metadata.isImplemented` before
 * calling `auth`/`executor` — the placeholder's failure mode already is the
 * correct behavior for an unimplemented broker.
 */
export interface BrokerDefinition {
  readonly metadata: BrokerMetadata;
  readonly auth: IBrokerAuth;
  readonly executor: IOrderExecutor;
}
