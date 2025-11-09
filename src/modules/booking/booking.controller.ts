import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingsService } from 'src/modules/booking/booking.service';

@Controller('bookings')
export class BookingsController {
  constructor(private bookingsService: BookingsService) {}

  // GET /bookings/availability?timeMin=...&timeMax=...
  @Get('availability')
  async availability(
    @Query('timeMin') timeMin: string,
    @Query('timeMax') timeMax: string,
  ) {
    if (!timeMin || !timeMax) {
      return { error: 'timeMin and timeMax required' };
    }
    return this.bookingsService.getAvailability(timeMin, timeMax);
  }

  // POST /bookings
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async create(@Body() dto: CreateBookingDto) {
    const res = await this.bookingsService.createBooking(dto as any);
    return res;
  }
}
