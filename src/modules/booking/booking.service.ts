import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Booking, BookingDocument } from './schemas/booking.schema';
import { GoogleCalendarService } from './google-calendar.service';
import dayjs from 'dayjs';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);
  private readonly calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

  constructor(
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
    private googleCalendarService: GoogleCalendarService,
  ) {}



  // Check availability for a date range and return free/busy
  async getAvailability(timeMin: string, timeMax: string) {
    const busy = await this.googleCalendarService.getBusySlots(
      this.calendarId,
      timeMin,
      timeMax,
    );
    return { busy };
  }

  // Create booking (idempotent by idempotencyKey)
  async createBooking(data: {
    userId?: string;
    customerName: string;
    customerEmail: string;
    serviceId: string;
    start: string;
    end: string;
    notes?: string;
    idempotencyKey?: string;
  }) {
    const startISO = new Date(data.start).toISOString();
    const endISO = new Date(data.end).toISOString();

    // Basic checks
    if (!(new Date(startISO) < new Date(endISO))) {
      throw new BadRequestException('Invalid start/end range.');
    }

    // Check remote calendar is free
    const isFree = await this.googleCalendarService.isSlotFree(
      this.calendarId,
      startISO,
      endISO,
    );
    if (!isFree) {
      throw new ConflictException('Selected time slot is not available.');
    }

    // Create Google Calendar event
    const event = await this.googleCalendarService.createEvent(
      this.calendarId,
      {
        summary: `Booking - ${data.serviceId} - ${data.customerName}`,
        description: data.notes || '',
        start: { dateTime: startISO },
        end: { dateTime: endISO },
        attendees: [
          { email: data.customerEmail, displayName: data.customerName },
        ],
      },
    );

    const meetingLink = (() => {
      try {
        // conferenceData.entryPoints contain meet link
        const entry = event.conferenceData?.entryPoints?.find(
          (e) => e.entryPointType === 'video',
        );
        if (entry) return entry.uri;
        // fallback
        return event.hangoutLink || event.htmlLink;
      } catch {
        return event.hangoutLink || event.htmlLink;
      }
    })();

    const created = new this.bookingModel({
      userId: data.userId,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      serviceId: data.serviceId,
      start: startISO,
      end: endISO,
      calendarEventId: event.id,
      calendarHtmlLink: event.htmlLink,
      meetingLink,
      status: 'confirmed',
      notes: data.notes,
      raw: event,
    });

    await created.save();

    return {
      bookingId: created._id,
      meetingLink,
      calendarHtmlLink: event.htmlLink,
      calendarEventId: event.id,
    };
  }



  // Cancel booking and remove event
  async cancelBooking(bookingId: string) {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) throw new BadRequestException('Booking not found');

    if (booking.calendarEventId) {
      await this.googleCalendarService.deleteEvent(
        this.calendarId,
        booking.calendarEventId,
      );
    }

    booking.status = 'cancelled';
    await booking.save();

    return booking;
  }
}
