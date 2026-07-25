import { Module } from '@nestjs/common';
import { InstrumentMasterModule } from '@modules/instrument-master/instrument-master.module';
import { AuthModule } from '@modules/auth/auth.module';
import { InstrumentResolverService } from './instrument-resolver.service';
import { InstrumentResolverController } from './instrument-resolver.controller';

@Module({
  imports: [InstrumentMasterModule, AuthModule],
  controllers: [InstrumentResolverController],
  providers: [InstrumentResolverService],
  exports: [InstrumentResolverService],
})
export class InstrumentResolverModule {}
