import type { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { UsersService } from '@modules/users/users.service';
import { UserStatus } from '@modules/users/models/user-status.enum';
import type { MarketDataService } from '@modules/market-data/market-data.service';
import type { PaperTradeOwnershipService } from '@modules/paper-trading/paper-trade-ownership.service';
import { Tick } from '@modules/market-data/models/tick.model';
import { RealtimeGateway } from './realtime.gateway';

function buildSocket(overrides: Partial<Socket> = {}): Socket {
  return {
    id: 'socket-1',
    data: {},
    handshake: { auth: {}, query: {} },
    disconnect: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    ...overrides,
  } as unknown as Socket;
}

describe('RealtimeGateway', () => {
  let jwtService: jest.Mocked<Pick<JwtService, 'verifyAsync'>>;
  let usersService: jest.Mocked<Pick<UsersService, 'findById'>>;
  let marketDataService: jest.Mocked<
    Pick<
      MarketDataService,
      'subscribeInstrument' | 'unsubscribeInstrument' | 'getLastTick'
    >
  >;
  let ownershipService: jest.Mocked<
    Pick<PaperTradeOwnershipService, 'findByTradeId'>
  >;
  let eventBus: jest.Mocked<Pick<IEventBus, 'subscribe'>>;
  let gateway: RealtimeGateway;

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() };
    usersService = { findById: jest.fn() };
    marketDataService = {
      subscribeInstrument: jest.fn().mockResolvedValue(undefined),
      unsubscribeInstrument: jest.fn().mockResolvedValue(undefined),
      getLastTick: jest.fn().mockReturnValue(null),
    };
    ownershipService = { findByTradeId: jest.fn() };
    eventBus = { subscribe: jest.fn() };

    gateway = new RealtimeGateway(
      jwtService as unknown as JwtService,
      usersService as unknown as UsersService,
      marketDataService as unknown as MarketDataService,
      ownershipService as unknown as PaperTradeOwnershipService,
      eventBus as unknown as IEventBus,
    );
  });

  describe('handleConnection', () => {
    it('disconnects a socket with no token', async () => {
      const socket = buildSocket();
      await gateway.handleConnection(socket);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects a socket whose token fails verification', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('bad token'));
      const socket = buildSocket({
        handshake: { auth: { token: 'x' }, query: {} } as never,
      });
      await gateway.handleConnection(socket);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects a socket for a non-ACTIVE user', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      usersService.findById.mockResolvedValue({
        id: 'user-1',
        status: UserStatus.DISABLED,
      } as never);
      const socket = buildSocket({
        handshake: { auth: { token: 'x' }, query: {} } as never,
      });
      await gateway.handleConnection(socket);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('authenticates a valid token for an ACTIVE user and never disconnects it', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      usersService.findById.mockResolvedValue({
        id: 'user-1',
        status: UserStatus.ACTIVE,
      } as never);
      const socket = buildSocket({
        handshake: { auth: { token: 'x' }, query: {} } as never,
      });
      await gateway.handleConnection(socket);
      expect(socket.disconnect).not.toHaveBeenCalled();
      expect((socket.data as { userId: string }).userId).toBe('user-1');
    });
  });

  describe('handleSubscribeInstrument', () => {
    function authenticatedSocket(): Socket {
      return buildSocket({ data: { userId: 'user-1' } });
    }

    it('never joins/subscribes an unauthenticated socket', async () => {
      const socket = buildSocket({ data: {} });
      await gateway.handleSubscribeInstrument(socket, {
        instrumentToken: 'TOKEN-1',
        exchange: 'NFO',
        tradingSymbol: 'NIFTY',
      });
      expect(socket.join).not.toHaveBeenCalled();
      expect(marketDataService.subscribeInstrument).not.toHaveBeenCalled();
    });

    it('joins the instrument room and subscribes via MarketDataService for an authenticated socket', async () => {
      const socket = authenticatedSocket();
      await gateway.handleSubscribeInstrument(socket, {
        instrumentToken: 'TOKEN-1',
        exchange: 'NFO',
        tradingSymbol: 'NIFTY',
      });
      expect(socket.join).toHaveBeenCalledWith('instrument:TOKEN-1');
      expect(marketDataService.subscribeInstrument).toHaveBeenCalled();
    });

    it('emits an immediate price snapshot to the joining socket when a last tick already exists — otherwise a client subscribing after ticks started flowing would wait indefinitely', async () => {
      const tick = new Tick(
        'TOKEN-1',
        'NIFTY24500CE',
        'NFO',
        176.5,
        176.4,
        176.6,
        100,
        50,
        new Date('2026-01-01T00:00:00.000Z'),
        1,
      );
      marketDataService.getLastTick.mockReturnValue(tick);
      const socket = authenticatedSocket();

      await gateway.handleSubscribeInstrument(socket, {
        instrumentToken: 'TOKEN-1',
        exchange: 'NFO',
        tradingSymbol: 'NIFTY',
      });

      expect(socket.emit).toHaveBeenCalledWith('price', {
        instrumentToken: 'TOKEN-1',
        price: 176.5,
        timestamp: tick.timestamp,
      });
    });

    it('does not emit a price snapshot when no tick has arrived for that instrument yet', async () => {
      marketDataService.getLastTick.mockReturnValue(null);
      const socket = authenticatedSocket();

      await gateway.handleSubscribeInstrument(socket, {
        instrumentToken: 'TOKEN-NEVER-TICKED',
        exchange: 'NFO',
        tradingSymbol: 'NIFTY',
      });

      expect(socket.emit).not.toHaveBeenCalledWith('price', expect.anything());
    });
  });

  describe('handleSubscribeTrade', () => {
    it('never joins the trade room for a non-owner, without confirming or denying the trade exists', async () => {
      ownershipService.findByTradeId.mockResolvedValue({
        tradeId: 'trade-1',
        userId: 'someone-else',
      } as never);
      const socket = buildSocket({ data: { userId: 'user-1' } });

      await gateway.handleSubscribeTrade(socket, { tradeId: 'trade-1' });

      expect(socket.join).not.toHaveBeenCalled();
    });

    it('joins the trade room for the actual owner', async () => {
      ownershipService.findByTradeId.mockResolvedValue({
        tradeId: 'trade-1',
        userId: 'user-1',
      } as never);
      const socket = buildSocket({ data: { userId: 'user-1' } });

      await gateway.handleSubscribeTrade(socket, { tradeId: 'trade-1' });

      expect(socket.join).toHaveBeenCalledWith('trade:trade-1');
    });
  });
});
