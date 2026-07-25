import { randomUUID } from 'node:crypto';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import type { IHealthIndicator } from '../interfaces/health-indicator.interface';
import type { HealthIndicatorResult } from '../models/health-indicator-result.model';
import { HealthStatus } from '../models/health-status.enum';
import { InternalHealthProbeEvent } from '../events/internal-health-probe.event';

/**
 * A round-trip self-test: publish a uniquely-identified probe event and
 * confirm our own subscriber observed it. The in-process EventEmitter
 * dispatches synchronously, so by the time `publish()` returns the round
 * trip has already completed — no polling, no timers, fully deterministic.
 */
@Injectable()
export class EventBusHealthIndicator implements IHealthIndicator, OnModuleInit {
  readonly name = 'eventBus';
  private lastProbeId: string | null = null;
  private received = false;

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<InternalHealthProbeEvent>(
      InternalHealthProbeEvent.EVENT_NAME,
      (event) => {
        if (event.probeId === this.lastProbeId) {
          this.received = true;
        }
      },
    );
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IHealthIndicator; the round trip is synchronous
  async check(): Promise<HealthIndicatorResult> {
    const probeId = randomUUID();
    this.lastProbeId = probeId;
    this.received = false;

    this.eventBus.publish(new InternalHealthProbeEvent(probeId));

    return {
      name: this.name,
      status: this.received ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
      message: this.received
        ? undefined
        : 'Event Bus round-trip probe was not observed',
      checkedAt: this.clock.now().toISOString(),
    };
  }
}
