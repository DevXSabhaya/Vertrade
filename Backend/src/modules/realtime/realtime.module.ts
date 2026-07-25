import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { MarketDataModule } from '@modules/market-data/market-data.module';
import { PaperTradingModule } from '@modules/paper-trading/paper-trading.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [AuthModule, MarketDataModule, PaperTradingModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
