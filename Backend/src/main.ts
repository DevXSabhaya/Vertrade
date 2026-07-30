import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { getConnectionToken } from '@nestjs/mongoose';
import helmet from 'helmet';
import type { Connection } from 'mongoose';
import { AppModule } from './app.module';
import { ConfigService } from '@core/config/config.service';
import { LoggerService } from '@core/logger/logger.service';
import { GlobalExceptionFilter } from '@common/filters/global-exception.filter';
import { createCorsOriginValidator } from '@core/config/cors-origin.util';
import { InstrumentMasterService } from '@modules/instrument-master/instrument-master.service';
import { MarketDataService } from '@modules/market-data/market-data.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useWebSocketAdapter(new IoAdapter(app));

  const logger = app.get(LoggerService);
  app.useLogger(logger);
  app.enableShutdownHooks();

  // Phase 20 hardening: this is a pure JSON/WebSocket API — no HTML/static
  // assets are ever served (confirmed: no ServeStaticModule/Swagger in this
  // codebase) — so Helmet's default CSP (default-src 'self') and the rest
  // of its defaults (X-Content-Type-Options: nosniff, X-Frame-Options: DENY,
  // Referrer-Policy, HSTS, etc.) are safe to apply as-is with no frontend
  // compatibility risk; there's no inline script/style for a CSP to break.
  app.use(helmet());

  // Phase 20 hardening: explicit, documented body-size limits rather than
  // relying on Express's implicit default (100kb) — no endpoint in this API
  // accepts large payloads (trade DTOs, auth bodies, etc. are all small
  // JSON objects), so 256kb is generous headroom while still bounding a
  // trivial memory-exhaustion DoS via oversized request bodies.
  app.useBodyParser('json', { limit: '256kb' });
  app.useBodyParser('urlencoded', { limit: '256kb', extended: true });

  app.useGlobalFilters(new GlobalExceptionFilter(logger));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const configService = app.get(ConfigService);
  // Environment-aware, explicit-allow-list CORS (Phase 13 fix):
  //  - Every environment trusts exactly the origin(s) in FRONTEND_URL
  //    (comma-separated for more than one), matched exactly — never a
  //    wildcard.
  //  - Development additionally trusts any http(s)://localhost:<port> /
  //    127.0.0.1:<port> origin, because Vite's dev port isn't fixed and
  //    silently shifts when the configured one is already taken. This
  //    fallback never applies outside development.
  //  - `credentials: false` because auth uses a bearer token in the
  //    Authorization header, never cookies — if a future phase needs
  //    cookie-based auth, this can flip to `true` safely because origins are
  //    already validated by exact match / explicit allow-list, never `*`.
  app.enableCors({
    origin: createCorsOriginValidator(
      configService.frontendUrls,
      !configService.isProduction,
    ),
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  if (!configService.isProduction) {
    // Dev-only diagnostic: confirms which physical MongoDB database/host this
    // process is actually persisting to, without ever logging the URI itself
    // (which may embed credentials). Helps catch "frontend says success but
    // I don't see it in Compass" cases caused by inspecting the wrong
    // database/instance rather than an actual persistence bug.
    const connection = app.get<Connection>(getConnectionToken());
    logger.log(
      `MongoDB connection state: ${String(connection.readyState)} (1 = connected), database: "${connection.name}", host: "${connection.host}", port: ${String(connection.port)}`,
      'Bootstrap',
    );
  }

  // Deploy platforms (Render, etc.) detect the process as healthy only once
  // it is actually accepting connections on $PORT — every extra await placed
  // between `create()` resolving and `listen()` delays that signal and, on a
  // memory-constrained instance, risks the process being killed before it
  // ever opens the port. `port`/`host` are never hardcoded: `port` falls
  // back to 3000 only when `PORT` is unset (see `env.validation.ts`), and
  // `0.0.0.0` (not `localhost`) is required for the platform's health check
  // to reach the process from outside its container.
  const port = configService.port;
  await app.listen(port, '0.0.0.0');
  logger.log(`Backend listening on port ${port}`, 'Bootstrap');

  // Everything below is deliberately fire-and-forget, started only after the
  // server is already accepting traffic — never awaited by bootstrap. Errors
  // are caught and logged rather than left as unhandled rejections, since
  // nothing here may ever fail the process once boot has already succeeded.
  if (configService.instrumentMasterProvider === 'MOCK') {
    // The mock provider is entirely in-memory (no network call) and small
    // (~10 equities + a handful of index option chains) — cheap either way —
    // but is still deferred so it can never be the reason the HTTP port
    // opens late. The real Dhan provider intentionally stays on its
    // cron-only refresh schedule (see InstrumentMasterService.onModuleInit)
    // and is never triggered here.
    app
      .get(InstrumentMasterService)
      .refresh()
      .then(() => {
        logger.log(
          'Instrument master cache populated from MockInstrumentMasterProvider',
          'Bootstrap',
        );
      })
      .catch((error: unknown) => {
        logger.error(
          `Instrument master warm-up failed: ${error instanceof Error ? error.message : 'unknown error'}`,
          'Bootstrap',
        );
      });
  }

  if (configService.marketDataProvider === 'MOCK') {
    // Same reasoning as the instrument master warm-up above: deferred so it
    // can never delay the HTTP port opening, not because it is expensive.
    app
      .get(MarketDataService)
      .start()
      .then(() => {
        logger.log('Market data started (MockMarketDataProvider)', 'Bootstrap');
      })
      .catch((error: unknown) => {
        logger.error(
          `Market data warm-up failed: ${error instanceof Error ? error.message : 'unknown error'}`,
          'Bootstrap',
        );
      });
  }
}

bootstrap().catch((error: unknown) => {
  console.error('Fatal error during bootstrap:', error);
  process.exit(1);
});
