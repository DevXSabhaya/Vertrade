import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { LoggerService } from '../src/core/logger/logger.service';
import { InstrumentMasterService } from '../src/modules/instrument-master/instrument-master.service';

/**
 * Requires a reachable MongoDB instance. Deliberately does NOT stub the
 * instrument master provider — this exercises the real
 * `MockInstrumentMasterProvider` wired in by `INSTRUMENT_MASTER_PROVIDER`
 * (defaulting to MOCK), proving natural trading calls like
 * "SENSEX 77200 CE" resolve end to end without any Dhan credentials.
 */
describe('Instrument resolver preview (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;
  const runId = Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `resolver-e2e-${runId}@example.com`,
        password: 'resolver-e2e-password',
        displayName: 'Resolver E2E',
      });
    token = res.body.accessToken as string;
  });

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await app.close();
  });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer())
      .get('/instruments/resolve')
      .query({ query: 'RELIANCE' })
      .expect(401);
  });

  it('resolves a plain equity symbol', async () => {
    const res = await request(app.getHttpServer())
      .get('/instruments/resolve')
      .set('Authorization', `Bearer ${token}`)
      .query({ query: 'RELIANCE' })
      .expect(200);

    expect(res.body.tradingSymbol).toBe('RELIANCE');
    expect(res.body.strike).toBeNull();
    expect(res.body.optionType).toBeNull();
  });

  it('resolves a natural index option trading call ("SENSEX 77200 CE")', async () => {
    const res = await request(app.getHttpServer())
      .get('/instruments/resolve')
      .set('Authorization', `Bearer ${token}`)
      .query({ query: 'SENSEX 77200 CE' })
      .expect(200);

    expect(res.body.strike).toBe(77200);
    expect(res.body.optionType).toBe('CE');
    expect(res.body.exchange).toBe('BSE_FNO');
    expect(res.body.instrumentToken).toEqual(expect.any(String));
    expect(res.body.expiry).toEqual(expect.any(String));
  });

  it('resolves a NIFTY PE trading call', async () => {
    const res = await request(app.getHttpServer())
      .get('/instruments/resolve')
      .set('Authorization', `Bearer ${token}`)
      .query({ query: 'NIFTY 25000 PE' })
      .expect(200);

    expect(res.body.strike).toBe(25000);
    expect(res.body.optionType).toBe('PE');
  });

  it('returns a clear 400 error for an unresolvable instrument, never a fake resolution', async () => {
    const res = await request(app.getHttpServer())
      .get('/instruments/resolve')
      .set('Authorization', `Bearer ${token}`)
      .query({ query: 'NOT-A-REAL-SYMBOL' })
      .expect(400);

    expect(res.body.message).toEqual(expect.any(String));
  });

  it('returns a clear error for an invalid strike on a known underlying', async () => {
    await request(app.getHttpServer())
      .get('/instruments/resolve')
      .set('Authorization', `Bearer ${token}`)
      .query({ query: 'SENSEX 1 CE' })
      .expect(400);
  });

  describe('GET /instruments/expiries', () => {
    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/instruments/expiries')
        .query({ query: 'BANKNIFTY 56800 PE' })
        .expect(401);
    });

    it('lists every live expiry for a real natural trading call, with lot size and (absent any ticks yet) a null current price', async () => {
      const res = await request(app.getHttpServer())
        .get('/instruments/expiries')
        .set('Authorization', `Bearer ${token}`)
        .query({ query: 'BANKNIFTY 56800 PE' })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      const contract = res.body[0];
      expect(contract.strike).toBe(56800);
      expect(contract.optionType).toBe('PE');
      expect(contract.lotSize).toEqual(expect.any(Number));
      expect(contract.expiry).toEqual(expect.any(String));
      expect(contract).toHaveProperty('currentPrice');
      expect(contract).toHaveProperty('lastUpdated');
    });

    it('never throws for an ambiguous underlying/strike — returns an empty-safe error only for a genuinely invalid strike', async () => {
      await request(app.getHttpServer())
        .get('/instruments/expiries')
        .set('Authorization', `Bearer ${token}`)
        .query({ query: 'SENSEX 1 CE' })
        .expect(400);
    });
  });

  describe('GET /instruments/search', () => {
    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/instruments/search')
        .query({ q: 'SENSEX' })
        .expect(401);
    });

    it('returns multiple candidates for a bare underlying — the whole point vs. /resolve', async () => {
      const res = await request(app.getHttpServer())
        .get('/instruments/search')
        .set('Authorization', `Bearer ${token}`)
        .query({ q: 'SENSEX' })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(1);
      const first = res.body[0];
      expect(first).toEqual(
        expect.objectContaining({
          displayName: expect.any(String),
          symbol: expect.any(String),
          exchange: expect.any(String),
          token: expect.any(String),
          instrumentType: expect.any(String),
          lotSize: expect.any(Number),
          tickSize: expect.any(Number),
        }),
      );
    });

    it('narrows to a single result for a fully-specified query', async () => {
      const res = await request(app.getHttpServer())
        .get('/instruments/search')
        .set('Authorization', `Bearer ${token}`)
        .query({ q: 'SENSEX 77200 CE' })
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].strike).toBe(77200);
      expect(res.body[0].optionType).toBe('CE');
      expect(res.body[0].instrumentType).toBe('OPTION');
    });

    it('classifies a plain equity as instrumentType EQUITY', async () => {
      const res = await request(app.getHttpServer())
        .get('/instruments/search')
        .set('Authorization', `Bearer ${token}`)
        .query({ q: 'RELIANCE' })
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].instrumentType).toBe('EQUITY');
      expect(res.body[0].strike).toBeNull();
      expect(res.body[0].optionType).toBeNull();
    });

    it('returns an empty array (never a 400) for a query matching nothing', async () => {
      const res = await request(app.getHttpServer())
        .get('/instruments/search')
        .set('Authorization', `Bearer ${token}`)
        .query({ q: 'NOT-A-REAL-SYMBOL' })
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('respects an explicit limit', async () => {
      const res = await request(app.getHttpServer())
        .get('/instruments/search')
        .set('Authorization', `Bearer ${token}`)
        .query({ q: 'SENSEX', limit: 1 })
        .expect(200);

      expect(res.body).toHaveLength(1);
    });

    it('rejects an empty q parameter', async () => {
      await request(app.getHttpServer())
        .get('/instruments/search')
        .set('Authorization', `Bearer ${token}`)
        .query({ q: '' })
        .expect(400);
    });
  });
});
