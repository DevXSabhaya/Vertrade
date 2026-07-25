import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { RecoveryEventPublisher } from './recovery-event-publisher';
import { RecoveryStep } from './models/recovery-step.enum';
import {
  RecoveryStartedEvent,
  RecoveryStepCompletedEvent,
  RecoveryCompletedEvent,
  RecoveryFailedEvent,
  RecoveryRetryingEvent,
  RecoverySnapshotSavedEvent,
  EngineRecoveredEvent,
  QueueRecoveredEvent,
} from './events';

describe('RecoveryEventPublisher', () => {
  let publishSpy: jest.Mock;
  let eventBus: IEventBus;
  let publisher: RecoveryEventPublisher;

  beforeEach(() => {
    publishSpy = jest.fn();
    eventBus = {
      publish: publishSpy,
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    publisher = new RecoveryEventPublisher(eventBus);
  });

  it('started() publishes RecoveryStartedEvent', () => {
    publisher.started('r1');
    expect(publishSpy).toHaveBeenCalledWith(expect.any(RecoveryStartedEvent));
  });

  it('stepCompleted() publishes RecoveryStepCompletedEvent', () => {
    publisher.stepCompleted('r1', RecoveryStep.VERIFY_DATABASE, 10);
    expect(publishSpy).toHaveBeenCalledWith(
      expect.any(RecoveryStepCompletedEvent),
    );
  });

  it('completed() publishes RecoveryCompletedEvent', () => {
    publisher.completed('r1', 100, 2, 3);
    expect(publishSpy).toHaveBeenCalledWith(expect.any(RecoveryCompletedEvent));
  });

  it('failed() publishes RecoveryFailedEvent', () => {
    publisher.failed('r1', RecoveryStep.RECONNECT_BROKER, 'timeout');
    expect(publishSpy).toHaveBeenCalledWith(expect.any(RecoveryFailedEvent));
  });

  it('retrying() publishes RecoveryRetryingEvent', () => {
    publisher.retrying('r1', RecoveryStep.RECONNECT_MARKET_DATA, 1, 'timeout');
    expect(publishSpy).toHaveBeenCalledWith(expect.any(RecoveryRetryingEvent));
  });

  it('snapshotSaved() publishes RecoverySnapshotSavedEvent', () => {
    publisher.snapshotSaved('s1', 1, 2);
    expect(publishSpy).toHaveBeenCalledWith(
      expect.any(RecoverySnapshotSavedEvent),
    );
  });

  it('engineRecovered() publishes EngineRecoveredEvent', () => {
    publisher.engineRecovered('r1', 3);
    expect(publishSpy).toHaveBeenCalledWith(expect.any(EngineRecoveredEvent));
  });

  it('queueRecovered() publishes QueueRecoveredEvent', () => {
    publisher.queueRecovered('r1', 4);
    expect(publishSpy).toHaveBeenCalledWith(expect.any(QueueRecoveredEvent));
  });
});
