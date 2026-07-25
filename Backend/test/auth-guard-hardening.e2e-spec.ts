import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

/**
 * Phase 20 hardening: `TradesController`, `PositionsController`,
 * `RecoveryController`, and `ReconciliationController` were previously
 * fully unauthenticated (global, platform-wide operational views/actions —
 * see each controller's docstring). This suite proves every route on all
 * four now requires a valid JWT, and that a valid token is actually
 * sufficient (there's no role system yet, so "authenticated" is the whole
 * bar — this is not an admin-only check).
 */
describe('Global controllers now require authentication (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;
  const runId = Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `auth-guard-e2e-${runId}@example.com`,
        password: 'auth-guard-e2e-password-1',
        displayName: 'Auth Guard E2E',
      });
    token = res.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('TradesController (/trades)', () => {
    it('rejects GET /trades/active with no token', async () => {
      await request(app.getHttpServer()).get('/trades/active').expect(401);
    });

    it('rejects GET /trades/history with no token', async () => {
      await request(app.getHttpServer()).get('/trades/history').expect(401);
    });

    it('rejects GET /trades with no token', async () => {
      await request(app.getHttpServer()).get('/trades').expect(401);
    });

    it('accepts GET /trades/active with a valid token', async () => {
      await request(app.getHttpServer())
        .get('/trades/active')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  describe('PositionsController (/positions)', () => {
    it('rejects GET /positions/active with no token', async () => {
      await request(app.getHttpServer()).get('/positions/active').expect(401);
    });

    it('rejects GET /positions with no token', async () => {
      await request(app.getHttpServer()).get('/positions').expect(401);
    });

    it('accepts GET /positions with a valid token', async () => {
      await request(app.getHttpServer())
        .get('/positions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  describe('RecoveryController (/recovery)', () => {
    it('rejects GET /recovery/status with no token', async () => {
      await request(app.getHttpServer()).get('/recovery/status').expect(401);
    });

    it('rejects GET /recovery/history with no token', async () => {
      await request(app.getHttpServer()).get('/recovery/history').expect(401);
    });

    it('accepts GET /recovery/status with a valid token', async () => {
      await request(app.getHttpServer())
        .get('/recovery/status')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  describe('ReconciliationController (/reconciliation)', () => {
    it('rejects GET /reconciliation/history with no token', async () => {
      await request(app.getHttpServer())
        .get('/reconciliation/history')
        .expect(401);
    });

    it('accepts GET /reconciliation/history with a valid token', async () => {
      await request(app.getHttpServer())
        .get('/reconciliation/history')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  it('rejects requests with an invalid/expired-looking token across all four controllers', async () => {
    const badAuth = 'Bearer this-is-not-a-real-jwt';
    await request(app.getHttpServer())
      .get('/trades/active')
      .set('Authorization', badAuth)
      .expect(401);
    await request(app.getHttpServer())
      .get('/positions')
      .set('Authorization', badAuth)
      .expect(401);
    await request(app.getHttpServer())
      .get('/recovery/status')
      .set('Authorization', badAuth)
      .expect(401);
    await request(app.getHttpServer())
      .get('/reconciliation/history')
      .set('Authorization', badAuth)
      .expect(401);
  });
});
