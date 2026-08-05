import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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
export class PaperAccountEventListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaperAccountEventListener.name);
  private readonly activeTasks = new Set<Promise<unknown>>();
  private destroyed = false;

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    private readonly paperAccountService: PaperAccountService,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<UserRegisteredEvent>(
      UserRegisteredEvent.EVENT_NAME,
      (event) => {
        const promise = this.paperAccountService.createForUser(event.userId);
        const task = promise
          .catch((error) => {
            if (this.destroyed) {
              return;
            }
            this.logger.error(error);
          })
          .finally(() => {
            this.activeTasks.delete(task);
          });
        this.activeTasks.add(task);
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    if (this.activeTasks.size > 0) {
      await Promise.all(Array.from(this.activeTasks));
    }
  }
}
