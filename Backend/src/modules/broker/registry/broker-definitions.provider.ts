import { BROKER_AUTH } from '../broker-auth/broker-auth.constants';
import type { IBrokerAuth } from '../broker-auth/interfaces/broker-auth.interface';
import { DhanExecutor } from '../executors/dhan/dhan.executor';
import { BrokerId } from './models/broker-id.enum';
import { BrokerCapability } from './models/broker-capability.enum';
import { NO_FEATURE_FLAGS } from './models/broker-feature-flags.model';
import type { BrokerDefinition } from './interfaces/broker-definition.interface';
import { PlaceholderBrokerAuth } from './placeholder/placeholder-broker-auth';
import { PlaceholderBrokerExecutor } from './placeholder/placeholder-broker-executor';
import { BROKER_DEFINITIONS } from './broker-registry.constants';

/** Registry entries for the seven brokers that have no live adapter yet — one line each to add a real implementation later: swap the placeholder auth/executor pair for a real one and flip `isImplemented`. */
const PLACEHOLDER_BROKERS: ReadonlyArray<{
  id: BrokerId;
  displayName: string;
}> = [
  { id: BrokerId.ANGEL_ONE, displayName: 'Angel One' },
  { id: BrokerId.UPSTOX, displayName: 'Upstox' },
  { id: BrokerId.ZERODHA, displayName: 'Zerodha' },
  { id: BrokerId.SHOONYA, displayName: 'Shoonya' },
  { id: BrokerId.FYERS, displayName: 'Fyers' },
  { id: BrokerId.ALICE_BLUE, displayName: 'Alice Blue' },
  { id: BrokerId.FIVE_PAISA, displayName: '5paisa' },
];

function buildPlaceholderDefinition(
  id: BrokerId,
  displayName: string,
): BrokerDefinition {
  return {
    metadata: {
      id,
      displayName,
      capabilities: [],
      featureFlags: NO_FEATURE_FLAGS,
      isImplemented: false,
    },
    auth: new PlaceholderBrokerAuth(displayName),
    executor: new PlaceholderBrokerExecutor(displayName),
  };
}

function buildDhanDefinition(
  brokerAuth: IBrokerAuth,
  dhanExecutor: DhanExecutor,
): BrokerDefinition {
  return {
    metadata: {
      id: BrokerId.DHAN,
      displayName: 'Dhan',
      capabilities: [
        BrokerCapability.EQUITY,
        BrokerCapability.FNO,
        BrokerCapability.MARKET_DATA,
        BrokerCapability.OPTION_CHAIN,
      ],
      featureFlags: {
        ...NO_FEATURE_FLAGS,
        supportsOptionChain: true,
        supportsMarketData: true,
      },
      isImplemented: true,
    },
    auth: brokerAuth,
    executor: dhanExecutor,
  };
}

export function buildBrokerDefinitions(
  brokerAuth: IBrokerAuth,
  dhanExecutor: DhanExecutor,
): BrokerDefinition[] {
  return [
    buildDhanDefinition(brokerAuth, dhanExecutor),
    ...PLACEHOLDER_BROKERS.map(({ id, displayName }) =>
      buildPlaceholderDefinition(id, displayName),
    ),
  ];
}

export const BROKER_DEFINITIONS_PROVIDER = {
  provide: BROKER_DEFINITIONS,
  inject: [BROKER_AUTH, DhanExecutor],
  useFactory: (
    brokerAuth: IBrokerAuth,
    dhanExecutor: DhanExecutor,
  ): BrokerDefinition[] => buildBrokerDefinitions(brokerAuth, dhanExecutor),
};
