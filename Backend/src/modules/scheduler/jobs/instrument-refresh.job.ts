import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { InstrumentMasterService } from '@modules/instrument-master/instrument-master.service';
import type { IScheduledJob } from '../interfaces/scheduled-job.interface';
import { JobName } from '../models/job-name.enum';
import { InstrumentRefreshCompletedEvent } from '../events/instrument-refresh-completed.event';

/**
 * A second, configurable-interval trigger for InstrumentMasterService.refresh()
 * alongside Phase 3's own `@Cron('0 8 * * *')` on that same method — both are
 * safe to coexist since refresh() is idempotent-ish (always re-fetches and
 * atomically swaps the cache); this job exists so refresh cadence can also be
 * driven by the Scheduler's own configurable interval, per Part 10.
 */
@Injectable()
export class InstrumentRefreshJob implements IScheduledJob {
  readonly name = JobName.INSTRUMENT_REFRESH;

  constructor(
    private readonly instrumentMasterService: InstrumentMasterService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async run(): Promise<void> {
    const snapshot = await this.instrumentMasterService.refresh();
    this.eventBus.publish(
      new InstrumentRefreshCompletedEvent(snapshot.instrumentCount),
    );
  }
}
