import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SettingDocumentSchema,
  SettingMongooseSchema,
} from './settings.schema';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';
import { SETTINGS_REPOSITORY } from './settings.constants';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SettingDocumentSchema.name, schema: SettingMongooseSchema },
    ]),
  ],
  providers: [
    { provide: SETTINGS_REPOSITORY, useClass: SettingsRepository },
    SettingsService,
  ],
  exports: [SettingsService],
})
export class SettingsModule {}
