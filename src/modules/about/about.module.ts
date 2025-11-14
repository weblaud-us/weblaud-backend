import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AboutInfo, AboutInfoSchema } from './schemas/about-info.schema';
import { AboutInfoController } from 'src/modules/about/about.controller';
import { AboutInfoService } from 'src/modules/about/about.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AboutInfo.name, schema: AboutInfoSchema },
    ]),
  ],
  controllers: [AboutInfoController],
  providers: [AboutInfoService],
})
export class AboutInfoModule {}
