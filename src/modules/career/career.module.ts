import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Career, CareerSchema } from './schemas/career.schema';
import { Application, ApplicationSchema } from './schemas/application.schema';
import { UploadModule } from '../upload/upload.module';
import { MailModule } from '../mail/mail.module';
import { ConfigModule } from '@nestjs/config';
import { CareerController } from 'src/modules/career/career.controller';
import { CareerService } from 'src/modules/career/career.service';

@Module({
  imports: [
    ConfigModule,
    UploadModule,
    MailModule,
    MongooseModule.forFeature([
      { name: Career.name, schema: CareerSchema },
      { name: Application.name, schema: ApplicationSchema },
    ]),
  ],
  controllers: [CareerController],
  providers: [CareerService],
  exports: [CareerService],
})
export class CareerModule {}
