import { Inject, Logger, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import {
  createCorsOriginValidator,
  parseAllowedOrigins,
} from '@core/config/cors-origin.util';
import { UsersService } from '@modules/users/users.service';
import { UserStatus } from '@modules/users/models/user-status.enum';
import type { JwtPayload } from '@modules/auth/models/jwt-payload.model';
import { PaperTradeOwnershipService } from '@modules/paper-trading/paper-trade-ownership.service';
import { MarketDataService } from '@modules/market-data/market-data.service';
import { MarketDataInstrument } from '@modules/market-data/models/market-data-instrument.model';
import { MarketPriceUpdatedEvent } from '@shared/events/market-price-updated.event';
import { TargetHitEvent } from '@modules/trading-engine/events/target-hit.event';
import { StopLossHitEvent } from '@modules/trading-engine/events/stop-loss-hit.event';
import { TradeExitedEvent } from '@modules/trading-engine/events/trade-exited.event';
import { TradeCompletedEvent } from '@modules/trading-engine/events/trade-completed.event';
import { StopLossMovedEvent } from '@modules/trade-lifecycle/events/stop-loss-moved.event';

interface AuthenticatedSocketData {
  userId: string;
}

interface SubscribeInstrumentPayload {
  instrumentToken: string;
  exchange: string;
  tradingSymbol: string;
}

interface SubscribeTradePayload {
  tradeId: string;
}

/**
 * The only network transport out of the backend (Phase 15). Bridges the
 * existing, unmodified internal Event Bus into the browser — never a second
 * source of truth for price/trade state, only a live re-broadcast of events
 * every REST endpoint already reflects. Two channels, joined explicitly by
 * the client (never auto-subscribed to everything):
 *  - `instrument:<token>` — price ticks for a specific instrument. No
 *    per-user authorization needed; price is not private data.
 *  - `trade:<tradeId>` — target/SL/exit/completion events for one trade.
 *    Gated by `PaperTradeOwnershipService` so a user can never observe
 *    another user's trade activity over the socket, mirroring the same
 *    ownership check the REST paper-trading endpoints already enforce.
 */
// Evaluated once at class-decoration time, before Nest's DI container
// exists — mirrors the exact same env-driven allow-list + dev-localhost
// fallback `main.ts` uses for the REST API's CORS (`cors-origin.util.ts`),
// just read directly from `process.env` since a decorator can't inject
// `ConfigService`.
const frontendUrlEnv = process.env.FRONTEND_URL?.trim();
const wsAllowedOrigins = parseAllowedOrigins(
  frontendUrlEnv && frontendUrlEnv !== ''
    ? frontendUrlEnv
    : 'http://localhost:5173',
);
const wsIsDevelopment = process.env.NODE_ENV !== 'production';

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: createCorsOriginValidator(wsAllowedOrigins, wsIsDevelopment),
    credentials: false,
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  /** Tracks which instrument tokens each socket explicitly subscribed to, so disconnect can cleanly unsubscribe from MarketDataService. */
  private readonly socketInstrumentSubscriptions = new Map<
    string,
    Set<string>
  >();

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly marketDataService: MarketDataService,
    private readonly paperTradeOwnershipService: PaperTradeOwnershipService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<MarketPriceUpdatedEvent>(
      MarketPriceUpdatedEvent.EVENT_NAME,
      (event) => {
        this.server.to(`instrument:${event.instrumentToken}`).emit('price', {
          instrumentToken: event.instrumentToken,
          price: event.price,
          timestamp: event.metadata.timestamp,
        });
      },
    );

    this.eventBus.subscribe<TargetHitEvent>(
      TargetHitEvent.EVENT_NAME,
      (event) => {
        this.emitTradeEvent(event.tradeId, 'targetHit', {
          targetPrice: event.targetPrice,
          targetIndex: event.targetIndex,
          remainingTargetsCount: event.remainingTargetsCount,
        });
      },
    );

    this.eventBus.subscribe<StopLossHitEvent>(
      StopLossHitEvent.EVENT_NAME,
      (event) => {
        this.emitTradeEvent(event.tradeId, 'stopLossHit', {
          price: event.price,
          stopLossPrice: event.stopLossPrice,
        });
      },
    );

    this.eventBus.subscribe<StopLossMovedEvent>(
      StopLossMovedEvent.EVENT_NAME,
      (event) => {
        this.emitTradeEvent(event.tradeId, 'stopLossMoved', {
          previousStopLoss: event.previousStopLoss,
          newStopLoss: event.newStopLoss,
          strategy: event.strategy,
        });
      },
    );

    this.eventBus.subscribe<TradeExitedEvent>(
      TradeExitedEvent.EVENT_NAME,
      (event) => {
        this.emitTradeEvent(event.tradeId, 'tradeExited', {
          exitPrice: event.exitPrice,
          exitedQuantity: event.exitedQuantity,
        });
      },
    );

    this.eventBus.subscribe<TradeCompletedEvent>(
      TradeCompletedEvent.EVENT_NAME,
      (event) => {
        this.emitTradeEvent(event.tradeId, 'tradeCompleted', {
          realizedPnl: event.realizedPnl,
        });
      },
    );
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      const user = await this.usersService.findById(payload.sub);
      if (user.status !== UserStatus.ACTIVE) {
        client.disconnect(true);
        return;
      }
      (client.data as AuthenticatedSocketData).userId = user.id;
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const tokens = this.socketInstrumentSubscriptions.get(client.id);
    if (tokens) {
      for (const instrumentToken of tokens) {
        void this.marketDataService
          .unsubscribeInstrument(instrumentToken, `ws:${client.id}`)
          .catch(() => undefined);
      }
      this.socketInstrumentSubscriptions.delete(client.id);
    }
  }

  @SubscribeMessage('subscribe:instrument')
  async handleSubscribeInstrument(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribeInstrumentPayload,
  ): Promise<void> {
    if (!this.isAuthenticated(client)) return;

    await client.join(`instrument:${payload.instrumentToken}`);
    await this.marketDataService
      .subscribeInstrument(
        new MarketDataInstrument(
          payload.exchange,
          payload.tradingSymbol,
          payload.instrumentToken,
        ),
        `ws:${client.id}`,
      )
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to subscribe socket ${client.id} to ${payload.instrumentToken}: ${String(error)}`,
        );
      });

    const tokens =
      this.socketInstrumentSubscriptions.get(client.id) ?? new Set();
    tokens.add(payload.instrumentToken);
    this.socketInstrumentSubscriptions.set(client.id, tokens);
  }

  @SubscribeMessage('unsubscribe:instrument')
  async handleUnsubscribeInstrument(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { instrumentToken: string },
  ): Promise<void> {
    await client.leave(`instrument:${payload.instrumentToken}`);
    await this.marketDataService
      .unsubscribeInstrument(payload.instrumentToken, `ws:${client.id}`)
      .catch(() => undefined);
    this.socketInstrumentSubscriptions
      .get(client.id)
      ?.delete(payload.instrumentToken);
  }

  @SubscribeMessage('subscribe:trade')
  async handleSubscribeTrade(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribeTradePayload,
  ): Promise<void> {
    if (!this.isAuthenticated(client)) return;

    const ownership = await this.paperTradeOwnershipService.findByTradeId(
      payload.tradeId,
    );
    if (!ownership || ownership.userId !== this.userIdOf(client)) {
      // Never confirms or denies the trade's existence to a non-owner —
      // silently refuses to join, exactly like the REST endpoints return 404
      // (not 403) for another user's trade.
      return;
    }

    await client.join(`trade:${payload.tradeId}`);
  }

  private emitTradeEvent(
    tradeId: string,
    type: string,
    payload: Record<string, unknown>,
  ): void {
    this.server.to(`trade:${tradeId}`).emit('tradeEvent', {
      tradeId,
      type,
      ...payload,
    });
  }

  private isAuthenticated(client: Socket): boolean {
    return typeof (client.data as AuthenticatedSocketData).userId === 'string';
  }

  private userIdOf(client: Socket): string {
    return (client.data as AuthenticatedSocketData).userId;
  }

  private extractToken(client: Socket): string | null {
    const fromAuth = client.handshake.auth?.token as string | undefined;
    if (fromAuth) return fromAuth;
    const fromQuery = client.handshake.query?.token;
    if (typeof fromQuery === 'string') return fromQuery;
    return null;
  }
}
