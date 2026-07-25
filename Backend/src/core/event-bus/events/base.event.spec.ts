import { CorrelationIdStore } from '../../correlation/correlation-id.store';
import { DomainEvent } from './domain-event.base';
import { IntegrationEvent } from './integration-event.base';
import { EventCategory } from '@shared/enums/event-category.enum';

class TestDomainEvent extends DomainEvent {
  readonly eventName = 'test.domain-event';
}

class TestIntegrationEvent extends IntegrationEvent {
  readonly eventName = 'test.integration-event';
}

describe('BaseEvent', () => {
  it('has no correlation id when created outside a request context', () => {
    const event = new TestDomainEvent();
    expect(event.metadata.correlationId).toBeUndefined();
  });

  it('automatically picks up the correlation id from the active context', () => {
    CorrelationIdStore.run('ctx-correlation-id', () => {
      const event = new TestDomainEvent();
      expect(event.metadata.correlationId).toBe('ctx-correlation-id');
    });
  });

  it('tags DomainEvent with the DOMAIN category', () => {
    const event = new TestDomainEvent();
    expect(event.metadata.category).toBe(EventCategory.DOMAIN);
  });

  it('tags IntegrationEvent with the INTEGRATION category', () => {
    const event = new TestIntegrationEvent();
    expect(event.metadata.category).toBe(EventCategory.INTEGRATION);
  });
});
