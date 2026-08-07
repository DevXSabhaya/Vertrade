import { BrokerRegistry } from './broker-registry.service';
import { BrokerFactory } from './broker-factory.service';
import { BrokerId } from './models/broker-id.enum';
import { NO_FEATURE_FLAGS } from './models/broker-feature-flags.model';
import type { BrokerDefinition } from './interfaces/broker-definition.interface';
import { UnknownBrokerException } from './exceptions/unknown-broker.exception';
import { PlaceholderBrokerAuth } from './placeholder/placeholder-broker-auth';
import { PlaceholderBrokerExecutor } from './placeholder/placeholder-broker-executor';
import { BrokerNotImplementedException } from './exceptions/broker-not-implemented.exception';

function definition(
  id: BrokerId,
  isImplemented: boolean,
  displayName: string = id,
): BrokerDefinition {
  return {
    metadata: {
      id,
      displayName,
      capabilities: [],
      featureFlags: NO_FEATURE_FLAGS,
      isImplemented,
    },
    auth: new PlaceholderBrokerAuth(displayName),
    executor: new PlaceholderBrokerExecutor(displayName),
  };
}

describe('BrokerRegistry', () => {
  const dhan = definition(BrokerId.DHAN, true, 'Dhan');
  const angelOne = definition(BrokerId.ANGEL_ONE, false, 'Angel One');
  let registry: BrokerRegistry;

  beforeEach(() => {
    registry = new BrokerRegistry([dhan, angelOne]);
  });

  it('returns every registered broker via getAll', () => {
    expect(registry.getAll()).toHaveLength(2);
  });

  it('looks up a broker by id', () => {
    expect(registry.get(BrokerId.DHAN)).toBe(dhan);
  });

  it('throws UnknownBrokerException for an unregistered id', () => {
    expect(() => registry.get(BrokerId.ZERODHA)).toThrow(
      UnknownBrokerException,
    );
  });

  it('isSupported is true for any registered broker regardless of implementation status', () => {
    expect(registry.isSupported(BrokerId.DHAN)).toBe(true);
    expect(registry.isSupported(BrokerId.ANGEL_ONE)).toBe(true);
    expect(registry.isSupported(BrokerId.ZERODHA)).toBe(false);
  });

  it('isImplemented distinguishes real adapters from placeholders', () => {
    expect(registry.isImplemented(BrokerId.DHAN)).toBe(true);
    expect(registry.isImplemented(BrokerId.ANGEL_ONE)).toBe(false);
  });
});

describe('BrokerFactory', () => {
  const dhan = definition(BrokerId.DHAN, true, 'Dhan');
  const angelOne = definition(BrokerId.ANGEL_ONE, false, 'Angel One');
  let factory: BrokerFactory;

  beforeEach(() => {
    factory = new BrokerFactory(new BrokerRegistry([dhan, angelOne]));
  });

  it('lists metadata for every registered broker', () => {
    const metadata = factory.listMetadata();
    expect(metadata.map((m) => m.id)).toEqual([
      BrokerId.DHAN,
      BrokerId.ANGEL_ONE,
    ]);
  });

  it('returns the real auth/executor for an implemented broker', () => {
    expect(factory.getAuth(BrokerId.DHAN)).toBe(dhan.auth);
    expect(factory.getExecutor(BrokerId.DHAN)).toBe(dhan.executor);
  });

  it('a placeholder broker still resolves a real, interface-satisfying object — it just rejects on use', async () => {
    const auth = factory.getAuth(BrokerId.ANGEL_ONE);
    await expect(auth.login()).rejects.toThrow(BrokerNotImplementedException);
    await expect(auth.login()).rejects.toThrow(/Angel One/);

    const executor = factory.getExecutor(BrokerId.ANGEL_ONE);
    await expect(executor.placeEntryOrder({} as never, null)).rejects.toThrow(
      BrokerNotImplementedException,
    );
  });
});
