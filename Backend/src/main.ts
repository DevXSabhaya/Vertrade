import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AppModule } from './app.module';
import { ConfigService } from '@core/config/config.service';
import { LoggerService } from '@core/logger/logger.service';
import { GlobalExceptionFilter } from '@common/filters/global-exception.filter';
import { createCorsOriginValidator } from '@core/config/cors-origin.util';
import { InstrumentMasterService } from '@modules/instrument-master/instrument-master.service';
import { MarketDataService } from '@modules/market-data/market-data.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useWebSocketAdapter(new IoAdapter(app));

  const logger = app.get(LoggerService);
  app.useLogger(logger);
  app.enableShutdownHooks();
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

  if (configService.instrumentMasterProvider === 'MOCK') {
    // The mock provider is entirely in-memory (no network call), so eagerly
    // populating the cache at boot is safe and doesn't risk startup ever
    // blocking on/failing due to external connectivity — unlike the real
    // Angel One provider, which intentionally stays on its cron-only refresh
    // schedule (see InstrumentMasterService.onModuleInit). Without this, a
    // fresh Paper-only deployment would have an empty instrument cache until
    // the next 8am cron tick, and no trade could ever resolve.
    await app.get(InstrumentMasterService).refresh();
    logger.log(
      'Instrument master cache populated from MockInstrumentMasterProvider',
      'Bootstrap',
    );
  }

  if (configService.marketDataProvider === 'MOCK') {
    // Same reasoning as the instrument master cache above: the mock provider
    // makes no real network call, so starting it eagerly is safe and never
    // risks blocking/failing boot on external connectivity — unlike the real
    // Angel One provider, which stays on-demand (started by the Scheduler's
    // Morning Startup routine, a later explicit opt-in). Without this, no
    // subscribed instrument would ever tick and neither the WebSocket
    // gateway's price channel nor SL/target evaluation would receive any
    // price updates in a fresh Paper-only deployment.
    await app.get(MarketDataService).start();
    logger.log('Market data started (MockMarketDataProvider)', 'Bootstrap');
  }

  await app.listen(configService.port);
  logger.log(`Backend listening on port ${configService.port}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  console.error('Fatal error during bootstrap:', error);
  process.exit(1);
});
