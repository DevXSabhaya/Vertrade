import { Module } from '@nestjs/common';
import { ConfigModule } from '@core/config/config.module';
import { BrokerHealthModule } from '@modules/broker-health/broker-health.module';
import { TradingModeModule } from '@modules/trading-mode/trading-mode.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ConfigModule, BrokerHealthModule, TradingModeModule],
  controllers: [HealthController],
})
export class HealthModule {}
