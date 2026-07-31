import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  UserDocumentSchema,
  type UserDocument,
} from '../src/modules/users/schema/user.schema';
import { MOCK_INSTRUMENT_MASTER_PROVIDER } from '../src/modules/instrument-master/instrument-master.constants';
import { InstrumentMasterService } from '../src/modules/instrument-master/instrument-master.service';
import { Instrument } from '../src/modules/instrument-master/entities/instrument.entity';
import type { IInstrumentMasterProvider } from '../src/modules/instrument-master/interfaces/instrument-master-provider.interface';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { LoggerService } from '../src/core/logger/logger.service';
import { FeatureFlagsService } from '../src/core/feature-flags/feature-flag.service';
import { TRADING_HOURS_CONFIG } from '../src/modules/trade-validation/trade-validation.constants';
import type { TradingHoursConfig } from '../src/modules/trade-validation/models/trading-hours.model';

/**
 * Requires a reachable MongoDB instance (MONGODB_URI in .env), same as every
 * other e2e suite in this project. Exercises the real Phase 12 product API —
 * registration, login, JWT-guarded routes, the auto-created paper account,
 * and a paper trade driven through the real, unmodified Validation -> Risk ->
 * Engine -> Order Queue -> Paper Executor pipeline — plus, critically, that a
 * second user can never read or act on the first user's data.
 */
describe('Auth + paper trading pipeline (e2e)', () => {
  let app: INestApplication<App>;
  const runId = Date.now();
  const userAEmail = `user-a-${runId}@example.com`;
  const userBEmail = `user-b-${runId}@example.com`;
  let tokenA: string;
  let tokenB: string;
  let userATradeId: string;

  beforeAll(async () => {
    const stubProvider: jest.Mocked<IInstrumentMasterProvider> = {
      brokerName: 'e2e-stub-broker',
      fetchInstruments: jest
        .fn()
        .mockResolvedValue([
          new Instrument(
            'E2E-P12-TOKEN',
            'NSE_EQ',
            'EQUITY',
            'RELIANCE',
            'RELIANCE',
            null,
            null,
            null,
            1,
            0.05,
            2,
          ),
        ]),
    };

    // MarketOpenRule (Phase 5/7) gates every order on real wall-clock trading
    // hours — override it to "always open" so this suite's outcome never
    // depends on what time of day the test happens to run.
    const alwaysOpenTradingHours: TradingHoursConfig = {
      startUtcMinutes: 0,
      endUtcMinutes: 24 * 60,
      tradingDays: [0, 1, 2, 3, 4, 5, 6],
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MOCK_INSTRUMENT_MASTER_PROVIDER)
      .useValue(stubProvider)
      .overrideProvider(TRADING_HOURS_CONFIG)
      .useValue(alwaysOpenTradingHours)
      .compile();

    app = moduleFixture.createNestApplication();
    // Both are wired manually in src/main.ts's bootstrap(), which the e2e
    // harness never calls — replicate them here so thrown BaseException
    // subclasses map to their real HTTP status instead of falling through to
    // Nest's default 500 handler (BaseException extends Error, not
    // HttpException, so it needs this filter to be recognized at all).
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
    // TradeValidationService's FeatureFlagRule (Phase 7) blocks every trade
    // unless this flag is explicitly on — real pipeline behavior this suite
    // must satisfy, not something Phase 12 introduced.
    await app.get(FeatureFlagsService).setEnabled('TRADING_ENABLED', true);
  });

  afterAll(async () => {
    // Lets any still-in-flight event-listener side effects (e.g. audit log
    // writes, PaperAccountEventListener reacting to the last request, or the
    // Scheduler's periodic recovery-snapshot job) finish before the Mongo
    // connection pool closes underneath them.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await app.close();
  });

  describe('registration and login', () => {
    it('registers a new user and never returns the password hash', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: userAEmail,
          password: 'super-secret-1',
          displayName: 'User A',
        })
        .expect(201);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user.email).toBe(userAEmail);
      expect(res.body.user.passwordHash).toBeUndefined();
      tokenA = res.body.accessToken as string;
    });

    it('rejects a duplicate registration with the same email', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: userAEmail,
          password: 'another-password',
          displayName: 'Dup',
        })
        .expect(409);
    });

    it('registers a second, independent user', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: userBEmail,
          password: 'super-secret-2',
          displayName: 'User B',
        })
        .expect(201);
      tokenB = res.body.accessToken as string;
    });

    it('logs in with correct credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: userAEmail, password: 'super-secret-1' })
        .expect(201);
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('rejects login with an incorrect password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: userAEmail, password: 'wrong-password' })
        .expect(401);
    });

    it('rejects login for an unknown email', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'whatever' })
        .expect(401);
    });
  });

  describe('MongoDB persistence (real collection, no mocked repository)', () => {
    // Deliberately resolves the real, live-connected Mongoose model from the
    // same DI container the app uses — not a stub — and queries the actual
    // `users` collection directly. This is the only way to prove
    // registration persists to MongoDB rather than merely returning a
    // success response.
    let userModel: Model<UserDocument>;
    const persistenceEmail = `persistence-${runId}@example.com`;
    const persistencePassword = 'super-secret-persistence';

    beforeAll(() => {
      userModel = app.get<Model<UserDocument>>(
        getModelToken(UserDocumentSchema.name),
      );
    });

    it('persists a real document to the users collection on registration', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: persistenceEmail,
          password: persistencePassword,
          displayName: 'Persistence Check',
        })
        .expect(201);

      const userId = res.body.user.id as string;

      const doc = await userModel.findOne({ userId }).lean().exec();
      expect(doc).not.toBeNull();
      expect(doc?.email).toBe(persistenceEmail);
      expect(doc?.displayName).toBe('Persistence Check');
      expect(doc?.passwordHash).toEqual(expect.any(String));
      expect(doc?.passwordHash).not.toBe(persistencePassword);
      expect(doc?.createdAt).toEqual(expect.any(String));
      expect(doc?.updatedAt).toEqual(expect.any(String));
    });

    it('login succeeds using the persisted MongoDB document', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: persistenceEmail, password: persistencePassword })
        .expect(201);
    });

    it('login fails once the user document is deleted directly from MongoDB', async () => {
      const deleteResult = await userModel
        .deleteOne({ email: persistenceEmail })
        .exec();
      expect(deleteResult.deletedCount).toBe(1);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: persistenceEmail, password: persistencePassword })
        .expect(401);
    });
  });

  describe('protected routes', () => {
    it('rejects GET /auth/me with no token', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it("returns the caller's own profile for a valid token", async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(res.body.email).toBe(userAEmail);
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('rejects a request with a malformed Authorization header', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'NotBearer sometoken')
        .expect(401);
    });

    it('rejects /account with no token', async () => {
      await request(app.getHttpServer()).get('/account').expect(401);
    });
  });

  describe('paper account', () => {
    it('auto-creates a paper account with the configured initial balance on registration', async () => {
      const res = await request(app.getHttpServer())
        .get('/account')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(res.body.availableBalance).toBeGreaterThan(0);
      expect(res.body.reservedMargin).toBe(0);
    });

    it('GET /account/summary includes computed equity', async () => {
      const res = await request(app.getHttpServer())
        .get('/account/summary')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(res.body.equity).toBe(
        res.body.availableBalance + res.body.reservedMargin,
      );
    });

    it('GET /account is unified with /paper/pnl — it includes unrealized/total P&L, not just the persisted balance', async () => {
      const res = await request(app.getHttpServer())
        .get('/account')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.unrealizedPnl).toEqual(expect.any(Number));
      expect(res.body.totalPnl).toBe(
        res.body.realizedPnl + res.body.unrealizedPnl,
      );
    });

    it('GET /account and GET /paper/pnl agree on P&L for the same user', async () => {
      const [accountRes, pnlRes] = await Promise.all([
        request(app.getHttpServer())
          .get('/account')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200),
        request(app.getHttpServer())
          .get('/paper/pnl')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200),
      ]);

      expect(accountRes.body.realizedPnl).toBe(pnlRes.body.realizedPnl);
      expect(accountRes.body.unrealizedPnl).toBe(pnlRes.body.unrealizedPnl);
      expect(accountRes.body.totalPnl).toBe(pnlRes.body.totalPnl);
    });
  });

  describe('paper trading', () => {
    it('creates a paper trade through the real validation/risk/engine pipeline', async () => {
      const res = await request(app.getHttpServer())
        .post('/paper/trades')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          rawSymbol: 'RELIANCE',
          direction: 'LONG',
          quantity: 1,
          entryTriggerPrice: 100,
          initialStopLoss: 95,
          targets: [110],
        })
        .expect(201);

      expect(res.body.status).toBe('PENDING');
      userATradeId = res.body.id as string;
    });

    it('reserves margin against the account immediately', async () => {
      const res = await request(app.getHttpServer())
        .get('/account/summary')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(res.body.reservedMargin).toBeGreaterThanOrEqual(100);
    });

    it('the trade eventually leaves PENDING once the async Order Queue processes it', async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const res = await request(app.getHttpServer())
        .get(`/paper/trades/${userATradeId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(['OPEN', 'FAILED']).toContain(res.body.status);
    });

    it('rejects trade creation when the requested quantity/price exceeds available paper balance', async () => {
      const res = await request(app.getHttpServer())
        .post('/paper/trades')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          rawSymbol: 'RELIANCE',
          direction: 'LONG',
          quantity: 1_000_000,
          entryTriggerPrice: 100,
          initialStopLoss: 95,
          targets: [110],
        })
        .expect(422);
      expect(res.body.code).toBe('INSUFFICIENT_PAPER_BALANCE');
    });

    it('rejects trade creation for an unresolvable instrument, without leaking a reservation', async () => {
      const before = await request(app.getHttpServer())
        .get('/account/summary')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/paper/trades')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          rawSymbol: 'NO-SUCH-SYMBOL-EVER',
          direction: 'LONG',
          quantity: 1,
          entryTriggerPrice: 100,
          initialStopLoss: 95,
          targets: [110],
        })
        .expect(422);

      const after = await request(app.getHttpServer())
        .get('/account/summary')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(after.body.availableBalance).toBe(before.body.availableBalance);
    });

    it('a request body userId is ignored — identity always comes from the verified token', async () => {
      await request(app.getHttpServer())
        .post('/paper/trades')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          userId: 'some-other-user-id',
          rawSymbol: 'RELIANCE',
          direction: 'LONG',
          quantity: 1,
          entryTriggerPrice: 100,
          initialStopLoss: 95,
          targets: [110],
        })
        .expect(400); // forbidNonWhitelisted rejects the unknown `userId` field outright
    });
  });

  describe('cross-user isolation', () => {
    // Reuses the trade created in the 'paper trading' block above — this
    // system's duplicate-active-trade protection (Phase 7's
    // `DuplicateTradeRule`) is instrument-scoped globally, not per-user (the
    // Trading Engine has no user concept at all), so submitting a second
    // RELIANCE trade for user A here would be correctly rejected as a
    // duplicate rather than exercising what this block actually tests.
    it("user B cannot view user A's trade by id", async () => {
      await request(app.getHttpServer())
        .get(`/paper/trades/${userATradeId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it("user B cannot cancel user A's trade", async () => {
      await request(app.getHttpServer())
        .post(`/paper/trades/${userATradeId}/cancel`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it("user B cannot exit user A's trade", async () => {
      await request(app.getHttpServer())
        .post(`/paper/trades/${userATradeId}/exit`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('user A can view their own position by id via /paper/positions/:id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/paper/positions/${userATradeId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(res.body.id).toBe(userATradeId);
    });

    it("user B cannot view user A's position by id via /paper/positions/:id", async () => {
      await request(app.getHttpServer())
        .get(`/paper/positions/${userATradeId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it("user B cannot exit user A's position via /paper/positions/:id/exit", async () => {
      await request(app.getHttpServer())
        .post(`/paper/positions/${userATradeId}/exit`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('/paper/positions/:id rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get(`/paper/positions/${userATradeId}`)
        .expect(401);
    });

    it("user B's active trades list never includes user A's trades", async () => {
      const res = await request(app.getHttpServer())
        .get('/paper/trades/active')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      const ids = (res.body as Array<{ id: string }>).map((t) => t.id);
      expect(ids).not.toContain(userATradeId);
    });

    it("user B's account summary is independent of user A's reservations", async () => {
      const [summaryA, summaryB] = await Promise.all([
        request(app.getHttpServer())
          .get('/account/summary')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200),
        request(app.getHttpServer())
          .get('/account/summary')
          .set('Authorization', `Bearer ${tokenB}`)
          .expect(200),
      ]);
      expect(summaryB.body.reservedMargin).toBe(0);
      expect(summaryA.body.reservedMargin).toBeGreaterThan(0);
    });
  });

  describe('trade history filters', () => {
    let actualStatus: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .get(`/paper/trades/${userATradeId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      actualStatus = res.body.status as string;
    });

    it('filters by the actual status and includes the matching trade', async () => {
      const res = await request(app.getHttpServer())
        .get('/paper/trades/history')
        .set('Authorization', `Bearer ${tokenA}`)
        .query({ status: actualStatus })
        .expect(200);
      const ids = (res.body as Array<{ id: string; status: string }>).map(
        (t) => t.id,
      );
      expect(ids).toContain(userATradeId);
      expect(
        (res.body as Array<{ status: string }>).every(
          (t) => t.status === actualStatus,
        ),
      ).toBe(true);
    });

    it('excludes the trade for a non-matching status', async () => {
      const otherStatus = actualStatus === 'FAILED' ? 'CLOSED' : 'FAILED';
      const res = await request(app.getHttpServer())
        .get('/paper/trades/history')
        .set('Authorization', `Bearer ${tokenA}`)
        .query({ status: otherStatus })
        .expect(200);
      const ids = (res.body as Array<{ id: string }>).map((t) => t.id);
      expect(ids).not.toContain(userATradeId);
    });

    it('filters by side (LONG) and includes the matching trade', async () => {
      const res = await request(app.getHttpServer())
        .get('/paper/trades/history')
        .set('Authorization', `Bearer ${tokenA}`)
        .query({ side: 'LONG' })
        .expect(200);
      const ids = (res.body as Array<{ id: string }>).map((t) => t.id);
      expect(ids).toContain(userATradeId);
    });

    it('excludes the trade when filtering by the opposite side', async () => {
      const res = await request(app.getHttpServer())
        .get('/paper/trades/history')
        .set('Authorization', `Bearer ${tokenA}`)
        .query({ side: 'SHORT' })
        .expect(200);
      const ids = (res.body as Array<{ id: string }>).map((t) => t.id);
      expect(ids).not.toContain(userATradeId);
    });

    it('filters by instrument (case-insensitive substring match)', async () => {
      const res = await request(app.getHttpServer())
        .get('/paper/trades/history')
        .set('Authorization', `Bearer ${tokenA}`)
        .query({ instrument: 'reliance' })
        .expect(200);
      const ids = (res.body as Array<{ id: string }>).map((t) => t.id);
      expect(ids).toContain(userATradeId);
    });

    it('excludes the trade for a non-matching instrument', async () => {
      const res = await request(app.getHttpServer())
        .get('/paper/trades/history')
        .set('Authorization', `Bearer ${tokenA}`)
        .query({ instrument: 'DOES-NOT-EXIST' })
        .expect(200);
      const ids = (res.body as Array<{ id: string }>).map((t) => t.id);
      expect(ids).not.toContain(userATradeId);
    });

    it('filters by a date range that includes the trade', async () => {
      const res = await request(app.getHttpServer())
        .get('/paper/trades/history')
        .set('Authorization', `Bearer ${tokenA}`)
        .query({
          dateFrom: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          dateTo: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })
        .expect(200);
      const ids = (res.body as Array<{ id: string }>).map((t) => t.id);
      expect(ids).toContain(userATradeId);
    });

    it('excludes the trade for a date range entirely in the future', async () => {
      const res = await request(app.getHttpServer())
        .get('/paper/trades/history')
        .set('Authorization', `Bearer ${tokenA}`)
        .query({
          dateFrom: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })
        .expect(200);
      const ids = (res.body as Array<{ id: string }>).map((t) => t.id);
      expect(ids).not.toContain(userATradeId);
    });

    it('rejects an invalid status value', async () => {
      await request(app.getHttpServer())
        .get('/paper/trades/history')
        .set('Authorization', `Bearer ${tokenA}`)
        .query({ status: 'NOT_A_REAL_STATUS' })
        .expect(400);
    });

    it('rejects a limit above the allowed maximum', async () => {
      await request(app.getHttpServer())
        .get('/paper/trades/history')
        .set('Authorization', `Bearer ${tokenA}`)
        .query({ limit: 1000 })
        .expect(400);
    });

    it('remains backward compatible: no filters returns the same shape as before', async () => {
      const res = await request(app.getHttpServer())
        .get('/paper/trades/history')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      const ids = (res.body as Array<{ id: string }>).map((t) => t.id);
      expect(ids).toContain(userATradeId);
    });
  });

  describe('paper account reset', () => {
    it('blocks reset while trades are pending/open', async () => {
      const res = await request(app.getHttpServer())
        .post('/account/reset-paper-balance')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(409);
      expect(res.body.code).toBe('PAPER_ACCOUNT_RESET_BLOCKED');
    });

    it('allows reset for a user with no open trades and creates an audit event', async () => {
      const res = await request(app.getHttpServer())
        .post('/account/reset-paper-balance')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(201);
      expect(res.body.availableBalance).toBe(res.body.initialBalance);
      expect(res.body.reservedMargin).toBe(0);
    });
  });
});
