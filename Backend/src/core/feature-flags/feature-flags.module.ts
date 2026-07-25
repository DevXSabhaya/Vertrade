import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  FeatureFlagDocumentSchema,
  FeatureFlagMongooseSchema,
} from './feature-flag.schema';
import { FeatureFlagRepository } from './feature-flag.repository';
import { FeatureFlagsService } from './feature-flag.service';
import { FEATURE_FLAG_REPOSITORY } from './feature-flags.constants';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: FeatureFlagDocumentSchema.name,
        schema: FeatureFlagMongooseSchema,
      },
    ]),
  ],
  providers: [
    { provide: FEATURE_FLAG_REPOSITORY, useClass: FeatureFlagRepository },
    FeatureFlagsService,
  ],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
