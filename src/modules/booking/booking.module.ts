import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Booking, BookingSchema } from './schemas/booking.schema';
import { GoogleCalendarService } from './google-calendar.service';
import { BookingsController } from 'src/modules/booking/booking.controller';
import { BookingsService } from 'src/modules/booking/booking.service';


@Module({
  imports: [MongooseModule.forFeature([{ name: Booking.name, schema: BookingSchema }])],
  providers: [GoogleCalendarService, BookingsService],
  controllers: [BookingsController],
  exports: [BookingsService],
})
export class BookingsModule {}
