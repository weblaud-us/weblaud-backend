import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Career, CareerSchema } from './schemas/career.schema';
import { Application, ApplicationSchema } from './schemas/application.schema';
import { MailModule } from '../mail/mail.module';
import { ConfigModule } from '@nestjs/config';
import { CareerController } from './career.controller';
import { CareerService } from './career.service';

@Module({
  imports: [
    ConfigModule,
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
