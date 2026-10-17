import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FeatureController } from './feature.controller';
import { FeatureService } from './feature.service';
import { Feature, FeatureSchema } from './schemas/feature.schema';
import { ClientProjectModule } from 'src/modules/client-project/client-project.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Feature.name, schema: FeatureSchema }]),
    ClientProjectModule,
  ],
  controllers: [FeatureController],
  providers: [FeatureService],
  exports: [FeatureService],
})
export class FeatureModule {}
