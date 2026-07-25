import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { UserRegisteredEvent } from '@modules/users/events/user-registered.event';
import { PaperAccountService } from './paper-account.service';

/**
 * Decoupled from `AuthModule`/`UsersModule` entirely — reacts to
 * `UserRegisteredEvent` on the shared event bus rather than `AuthService`
 * calling `PaperAccountService` directly, the same subscription idiom
 * `DailyRiskStateService`/`CooldownService` (Phase 11) use for
 * `TradeCompletedEvent`/`StopLossHitEvent`.
 */
@Injectable()
export class PaperAccountEventListener implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    private readonly paperAccountService: PaperAccountService,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<UserRegisteredEvent>(
      UserRegisteredEvent.EVENT_NAME,
      (event) => {
        void this.paperAccountService.createForUser(event.userId);
      },
    );
  }
}
