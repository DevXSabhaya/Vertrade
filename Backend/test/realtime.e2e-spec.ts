import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import type { App } from 'supertest/types';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { LoggerService } from '../src/core/logger/logger.service';
import { InstrumentMasterService } from '../src/modules/instrument-master/instrument-master.service';
import { MarketDataService } from '../src/modules/market-data/market-data.service';

/**
 * Requires a reachable MongoDB instance. Boots a real HTTP+WebSocket server
 * on a random port and connects with the real `socket.io-client` — the only
 * way to prove the gateway actually authenticates, joins rooms, and
 * re-broadcasts real `MarketPriceUpdatedEvent`s from the (also real, mock)
 * market data pipeline, end to end.
 */
describe('Realtime gateway (e2e)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  let token: string;
  const runId = Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter(app.get(LoggerService)));
    await app.init();
    await app.get(InstrumentMasterService).refresh();
    await app.get(MarketDataService).start();
    await app.listen(0);
    const httpServer = app.getHttpServer() as Server;
    const address = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `realtime-e2e-${runId}@example.com`,
        password: 'realtime-e2e-password',
        displayName: 'Realtime E2E',
      });
    token = res.body.accessToken as string;
  });

  afterAll(async () => {
    // This suite is the only one that generates continuous real price ticks
    // (every subscribed instrument re-ticks ~1/sec), which keeps triggering
    // RecoverySnapshotService's debounced "any event -> snapshot" listener.
    // Stop ticking first, then wait comfortably past one full debounce+write
    // cycle before closing Mongo, so no in-flight snapshot write ever hits
    // an already-closing connection.
    await app.get(MarketDataService).stop();
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await app.close();
  });

  function connect(authToken?: string): Socket {
    return io(`${baseUrl}/realtime`, {
      auth: authToken ? { token: authToken } : {},
      transports: ['websocket'],
      forceNew: true,
    });
  }

  it('disconnects a socket with no token', async () => {
    const socket = connect();
    const disconnected = await new Promise<boolean>((resolve) => {
      socket.on('disconnect', () => resolve(true));
      socket.on('connect', () => {
        setTimeout(() => resolve(false), 500);
      });
    });
    socket.close();
    expect(disconnected).toBe(true);
  }, 10_000);

  it('disconnects a socket with an invalid token', async () => {
    const socket = connect('not-a-real-token');
    const disconnected = await new Promise<boolean>((resolve) => {
      socket.on('disconnect', () => resolve(true));
      socket.on('connect', () => {
        setTimeout(() => resolve(false), 500);
      });
    });
    socket.close();
    expect(disconnected).toBe(true);
  }, 10_000);

  it('connects successfully with a valid token', async () => {
    const socket = connect(token);
    const connected = await new Promise<boolean>((resolve) => {
      socket.on('connect', () => resolve(true));
      socket.on('connect_error', () => resolve(false));
    });
    expect(connected).toBe(true);
    socket.close();
  }, 10_000);

  it('receives live price ticks after subscribing to an instrument', async () => {
    const resolveRes = await request(app.getHttpServer())
      .get('/instruments/resolve')
      .set('Authorization', `Bearer ${token}`)
      .query({ query: 'RELIANCE' })
      .expect(200);

    const socket = connect(token);
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });

    const priceEventPromise = new Promise<{
      instrumentToken: string;
      price: number;
    }>((resolve) => {
      socket.on(
        'price',
        (payload: { instrumentToken: string; price: number }) => {
          if (payload.instrumentToken === resolveRes.body.instrumentToken) {
            resolve(payload);
          }
        },
      );
    });

    socket.emit('subscribe:instrument', {
      instrumentToken: resolveRes.body.instrumentToken,
      exchange: resolveRes.body.exchange,
      tradingSymbol: resolveRes.body.tradingSymbol,
    });

    const tick = await priceEventPromise;
    expect(tick.instrumentToken).toBe(resolveRes.body.instrumentToken);
    expect(typeof tick.price).toBe('number');

    socket.close();
  }, 15_000);
});
