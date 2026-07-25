import { TradeExtensionStore } from './trade-extension.store';
import { FakeClock } from './testing/fake-clock';
import { FakeTradeExtensionRepository } from './testing/fake-trade-extension-repository';

describe('TradeExtensionStore', () => {
  let repository: FakeTradeExtensionRepository;
  let store: TradeExtensionStore;

  beforeEach(() => {
    repository = new FakeTradeExtensionRepository();
    store = new TradeExtensionStore(repository, new FakeClock());
  });

  describe('get', () => {
    it('returns a default extension for a trade that has never been patched', async () => {
      const extension = await store.get('t1');
      expect(extension.tradeId).toBe('t1');
      expect(extension.trailingEnabled).toBe(false);
      expect(extension.exitReason).toBeNull();
    });

    it('returns the persisted extension when one exists', async () => {
      await store.patch('t1', { brokerPositionId: 'POS-1' });
      const extension = await store.get('t1');
      expect(extension.brokerPositionId).toBe('POS-1');
    });
  });

  describe('getMany', () => {
    it('fills in defaults for ids with no persisted extension', async () => {
      await store.patch('t1', { brokerPositionId: 'POS-1' });

      const result = await store.getMany(['t1', 't2']);

      expect(result.get('t1')?.brokerPositionId).toBe('POS-1');
      expect(result.get('t2')?.brokerPositionId).toBeNull();
    });
  });

  describe('patch', () => {
    it('merges a partial patch onto the current (or default) extension', async () => {
      await store.patch('t1', { trailingEnabled: true });
      const patched = await store.patch('t1', { brokerPositionId: 'POS-2' });

      expect(patched.trailingEnabled).toBe(true);
      expect(patched.brokerPositionId).toBe('POS-2');
    });

    it('persists the patch via the repository', async () => {
      await store.patch('t1', { brokerPositionId: 'POS-3' });
      const found = await repository.find('t1');
      expect(found?.brokerPositionId).toBe('POS-3');
    });
  });
});
