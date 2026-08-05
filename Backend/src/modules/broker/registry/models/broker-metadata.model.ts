import type { BrokerId } from './broker-id.enum';
import type { BrokerCapability } from './broker-capability.enum';
import type { BrokerFeatureFlags } from './broker-feature-flags.model';

/** Static, non-secret description of a broker — what the frontend's Broker Manager renders for a broker card, independent of whether any account has connected it yet. */
export interface BrokerMetadata {
  readonly id: BrokerId;
  readonly displayName: string;
  readonly capabilities: readonly BrokerCapability[];
  readonly featureFlags: BrokerFeatureFlags;
  /** False for every broker except Dhan until a real IBrokerAuth/IOrderExecutor adapter is written for it. */
  readonly isImplemented: boolean;
}
