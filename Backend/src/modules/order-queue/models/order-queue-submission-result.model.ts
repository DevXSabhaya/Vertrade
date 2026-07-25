import type { ValidationFailure } from '@modules/trade-validation/models/validation-failure.model';
import type { QueueItemSnapshot } from './queue-item-snapshot';

export type OrderQueueSubmissionResult =
  | { readonly outcome: 'QUEUED'; readonly item: QueueItemSnapshot }
  | { readonly outcome: 'DUPLICATE'; readonly item: QueueItemSnapshot }
  | {
      readonly outcome: 'VALIDATION_FAILED';
      readonly failure: ValidationFailure;
    }
  | { readonly outcome: 'QUEUE_FULL' }
  | { readonly outcome: 'REJECTED_KILL_SWITCH' };
