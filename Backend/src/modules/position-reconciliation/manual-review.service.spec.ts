import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { ManualReviewService } from './manual-review.service';
import { MismatchLevel } from './models/mismatch-level.enum';
import type { ReconciliationReport } from './models/reconciliation-report.model';
import { ManualReviewRequiredEvent } from './events';

describe('ManualReviewService', () => {
  it('flags the report and publishes ManualReviewRequiredEvent, never mutating trade state', () => {
    const publishSpy = jest.fn();
    const eventBus: IEventBus = {
      publish: publishSpy,
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    const service = new ManualReviewService(eventBus);
    const report: ReconciliationReport = {
      id: 'r1',
      tradeId: 't1',
      generatedAt: new Date().toISOString(),
      mismatches: [],
      overallLevel: MismatchLevel.CRITICAL,
      autoRepaired: false,
      manualReviewRequired: false,
    };

    const result = service.flagForReview(report);

    expect(result.manualReviewRequired).toBe(true);
    expect(publishSpy).toHaveBeenCalledWith(
      expect.any(ManualReviewRequiredEvent),
    );
  });
});
