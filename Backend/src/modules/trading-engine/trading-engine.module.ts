import { Module } from '@nestjs/common';
import { ExecutorsModule } from '@modules/broker/executors/executors.module';
import { CLOCK } from '@shared/clock/clock.constants';
import { SystemClock } from '@shared/clock/system-clock';
import { TradingEngineService } from './trading-engine.service';

@Module({
  imports: [ExecutorsModule],
  providers: [TradingEngineService, { provide: CLOCK, useClass: SystemClock }],
  exports: [TradingEngineService],
})
export class TradingEngineModule {}
