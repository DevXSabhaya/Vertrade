import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { USER_TRADING_PREFERENCE_REPOSITORY } from '@modules/trading-mode/trading-mode.constants';
import type { IUserTradingPreferenceRepository } from '@modules/trading-mode/repository/user-trading-preference-repository.interface';
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
    @Inject(USER_TRADING_PREFERENCE_REPOSITORY)
    private readonly userTradingPreferenceRepository: IUserTradingPreferenceRepository,
    private readonly instrumentMasterService: InstrumentMasterService,
    private readonly marketDataService: MarketDataService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async run(): Promise<void> {
    // Broker Login + Token Validation — every user currently persisted as
    // LIVE with a selected broker account, independently. One account's
    // failure never blocks another's, or the rest of this job.
    const liveUsers =
      await this.userTradingPreferenceRepository.findAllLiveWithBroker();
    await Promise.all(
      liveUsers
        .filter((pref) => pref.selectedBrokerAccountId !== null)
        .map((pref) =>
          this.sessionManager.bootstrapLiveSession(
            pref.selectedBrokerAccountId as string,
          ),
        ),
    );

    // Refresh Instrument Master + Warm Cache (refresh() populates the
    // in-memory cache — there is no separate cache-warming step)
    await this.instrumentMasterService.refresh();

    // Start Market Data Provider
    await this.marketDataService.start();

    // Verify REST + Verify WebSocket
    const activeAccountIds = this.sessionManager.getAllActiveAccountIds();
    const restVerified =
      activeAccountIds.length > 0 &&
      activeAccountIds.every((accountId) =>
        this.sessionManager.isSessionValid(accountId),
      );
    const websocketVerified = this.marketDataService.getHealth().connected;

    this.eventBus.publish(
      new MorningStartupCompletedEvent(restVerified, websocketVerified),
    );
  }
}
