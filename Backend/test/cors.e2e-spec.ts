import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { LoggerService } from '../src/core/logger/logger.service';
import { ConfigService } from '../src/core/config/config.service';
import { createCorsOriginValidator } from '../src/core/config/cors-origin.util';

/**
 * Requires a reachable MongoDB instance (MONGODB_URI in .env), same as every
 * other e2e suite. Exercises the real CORS wiring end-to-end — not just the
 * pure validator function (covered by cors-origin.util.spec.ts) — against
 * the actual HTTP layer, the way a browser's preflight would.
 */
describe('CORS (e2e)', () => {
  let app: INestApplication<App>;
  let configService: ConfigService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter(app.get(LoggerService)));
    configService = app.get(ConfigService);
    app.enableCors({
      origin: createCorsOriginValidator(
        configService.frontendUrls,
        !configService.isProduction,
      ),
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
    await app.init();
  });

  afterAll(async () => {
    // Lets any still-in-flight background side effects (audit log writes,
    // the Scheduler's periodic jobs) finish before the Mongo connection pool
    // closes underneath them — same fix applied to the other longer-running
    // e2e suites in this project.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await app.close();
  });

  it('reflects the configured frontend origin on a preflight OPTIONS request', async () => {
    const configuredOrigin =
      configService.frontendUrls[0] ?? 'http://localhost:5173';

    const res = await request(app.getHttpServer())
      .options('/auth/login')
      .set('Origin', configuredOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(configuredOrigin);
  });

  it('reflects a different local dev port in development, not just the configured one', async () => {
    const res = await request(app.getHttpServer())
      .options('/auth/login')
      .set('Origin', 'http://localhost:59999')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(
      'http://localhost:59999',
    );
  });

  it('does not set an Access-Control-Allow-Origin header for a disallowed origin', async () => {
    const res = await request(app.getHttpServer())
      .options('/auth/login')
      .set('Origin', 'https://not-a-trusted-site.com')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows an actual GET request from the configured origin and still returns real data', async () => {
    const configuredOrigin =
      configService.frontendUrls[0] ?? 'http://localhost:5173';

    const res = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', configuredOrigin)
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBe(configuredOrigin);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('allows a POST request (e.g. register) from an allowed dev origin without CORS blocking it', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .set('Origin', 'http://localhost:5175')
      .send({
        email: `cors-e2e-${Date.now()}@example.com`,
        password: 'cors-e2e-password',
        displayName: 'Cors E2E',
      });

    // Whatever the business outcome, the CORS layer itself must not be what
    // blocks it — the allow-origin header must be present on the response.
    expect(res.headers['access-control-allow-origin']).toBe(
      'http://localhost:5175',
    );
  });

  it('never reflects a wildcard origin', async () => {
    const res = await request(app.getHttpServer())
      .options('/health')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });
});
