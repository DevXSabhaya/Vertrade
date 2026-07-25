import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { InstrumentMasterService } from '@modules/instrument-master/instrument-master.service';
import { MarketDataService } from '@modules/market-data/market-data.service';
import type { IScheduledJob } from '../interfaces/scheduled-job.interface';
import { JobName } from '../models/job-name.enum';
import { MorningStartupCompletedEvent } from '../events/morning-startup-completed.event';

/**
 * "Load Configuration" and "Load Feature Flags" (the first two documented
 * steps) already happened at process boot via NestJS DI — ConfigModule and
 * FeatureFlagsModule are both loaded before this job could ever run. The
 * remaining steps are real actions taken here, in order.
 */
@Injectable()
export class MorningStartupJob implements IScheduledJob {
  readonly name = JobName.MORNING_STARTUP;

  constructor(
    private readonly sessionManager: BrokerSessionManager,
    private readonly instrumentMasterService: InstrumentMasterService,
    private readonly marketDataService: MarketDataService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async run(): Promise<void> {
    // Broker Login + Token Validation
    await this.sessionManager.ensureSession();

    // Refresh Instrument Master + Warm Cache (refresh() populates the
    // in-memory cache — there is no separate cache-warming step)
    await this.instrumentMasterService.refresh();

    // Start Market Data Provider
    await this.marketDataService.start();

    // Verify REST + Verify WebSocket
    const restVerified = this.sessionManager.isSessionValid();
    const websocketVerified = this.marketDataService.getHealth().connected;

    this.eventBus.publish(
      new MorningStartupCompletedEvent(restVerified, websocketVerified),
    );
  }
}
