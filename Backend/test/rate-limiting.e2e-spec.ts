import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { LoggerService } from '../src/core/logger/logger.service';

/**
 * Phase 20 hardening: proves the actual `@Throttle()` limits on the
 * genuinely sensitive endpoints (login, register, forgot-password, trade
 * creation) are wired and enforced end-to-end — not just present in source.
 * One shared app instance for the whole file (matching every other e2e
 * suite's convention) — login/register/forgot-password/trade-creation each
 * have independent, per-route `@Throttle()` buckets, so they don't
 * interfere with each other even sharing one app.
 */
describe('Rate limiting (e2e)', () => {
  let app: INestApplication<App>;
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('throttles POST /auth/login after 5 requests per minute from the same IP', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: `nonexistent-${runId}@example.com`,
          password: 'wrong-password',
        });
      // Each of the first 5 is genuinely processed (and rejected as invalid
      // credentials, 401) — the throttle itself never fires yet.
      expect(res.status).toBe(401);
    }

    const sixth = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: `nonexistent-${runId}@example.com`,
        password: 'wrong-password',
      });
    expect(sixth.status).toBe(429);
  });

  it('throttles POST /paper/trades after 30 requests per minute from the same user', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `rate-limit-trades-${runId}@example.com`,
        password: 'rate-limit-password-1',
        displayName: 'Rate Limit Trades',
      })
      .expect(201);
    const token = registerRes.body.accessToken as string;

    for (let i = 0; i < 30; i += 1) {
      const res = await request(app.getHttpServer())
        .post('/paper/trades')
        .set('Authorization', `Bearer ${token}`)
        .send({
          rawSymbol: 'NO-SUCH-SYMBOL-EVER',
          direction: 'LONG',
          quantity: 1,
          entryTriggerPrice: 100,
          initialStopLoss: 95,
          targets: [110],
        });
      // Deliberately an unresolvable instrument so every call fails fast
      // (422) without reserving margin or touching the order queue/executor
      // — this test is only about the throttle count, not trade creation.
      expect(res.status).toBe(422);
    }

    const overLimit = await request(app.getHttpServer())
      .post('/paper/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rawSymbol: 'NO-SUCH-SYMBOL-EVER',
        direction: 'LONG',
        quantity: 1,
        entryTriggerPrice: 100,
        initialStopLoss: 95,
        targets: [110],
      });
    expect(overLimit.status).toBe(429);
  }, 30_000);

  it('throttles POST /auth/register after 20 requests per minute from the same IP', async () => {
    // Runs after the trade-creation test above, which already consumed one
    // slot of this same per-IP register bucket registering its own test
    // user — loop until the throttle actually fires (bounded, well above
    // the configured limit) rather than hardcoding an exact iteration
    // count, so this test doesn't depend on exactly how many register
    // calls earlier tests in this file happened to make.
    let successes = 0;
    let sawThrottled = false;
    for (let i = 0; i < 25 && !sawThrottled; i += 1) {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `rate-limit-register-${runId}-${i}@example.com`,
          password: 'rate-limit-password-1',
          displayName: 'Rate Limit Test',
        });
      if (res.status === 429) {
        sawThrottled = true;
      } else {
        expect(res.status).toBe(201);
        successes += 1;
      }
    }

    expect(sawThrottled).toBe(true);
    expect(successes).toBeGreaterThan(0);
    expect(successes).toBeLessThanOrEqual(20);
  }, 30_000);

  it('throttles POST /auth/forgot-password after 30 requests per minute from the same IP', async () => {
    for (let i = 0; i < 30; i += 1) {
      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: `rate-limit-forgot-${runId}-${i}@example.com` });
      // Always 202 regardless of account existence — no enumeration, even
      // under this per-IP throttle probe.
      expect(res.status).toBe(202);
    }

    const overLimit = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: `rate-limit-forgot-${runId}-overlimit@example.com` });
    expect(overLimit.status).toBe(429);
  }, 30_000);
});
