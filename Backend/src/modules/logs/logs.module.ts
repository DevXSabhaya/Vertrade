import { Module } from '@nestjs/common';
import { ApplicationLogSubscriber } from './application-log.subscriber';

@Module({
  providers: [ApplicationLogSubscriber],
})
export class LogsModule {}
