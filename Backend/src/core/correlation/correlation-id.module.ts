import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CorrelationIdMiddleware } from './correlation-id.middleware';
import { CorrelationIdService } from './correlation-id.service';

@Global()
@Module({
  providers: [CorrelationIdService],
  exports: [CorrelationIdService],
})
export class CorrelationIdModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
