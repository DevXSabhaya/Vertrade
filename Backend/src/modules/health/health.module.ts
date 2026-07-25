import { Module } from '@nestjs/common';
import { ConfigModule } from '@core/config/config.module';
import { BrokerHealthModule } from '@modules/broker-health/broker-health.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ConfigModule, BrokerHealthModule],
  controllers: [HealthController],
})
export class HealthModule {}
