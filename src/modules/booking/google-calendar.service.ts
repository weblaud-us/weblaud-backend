import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import dayjs from 'dayjs';

@Injectable()
export class GoogleCalendarService {
  private oAuth2Client: any;
  private calendar: any;
  private logger = new Logger(GoogleCalendarService.name);

  constructor() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri =
      process.env.GOOGLE_OAUTH_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob';
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      this.logger.error(
        'Missing Google OAuth configuration. Set GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN.',
      );
      // We still create a client but methods should check for valid auth.
    }

    this.oAuth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    );
    this.oAuth2Client.setCredentials({ refresh_token: refreshToken });
    this.calendar = google.calendar({ version: 'v3', auth: this.oAuth2Client });
  }

  // Check availability using freeBusy
  async getBusySlots(calendarId: string, timeMin: string, timeMax: string) {
    const res = await this.calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: [{ id: calendarId }],
      },
    });
    return res.data.calendars?.[calendarId]?.busy || [];
  }

  // Create event and ask for conference data (Google Meet)
  async createEvent(
    calendarId: string,
    event: {
      summary: string;
      description?: string;
      start: { dateTime: string; timeZone?: string };
      end: { dateTime: string; timeZone?: string };
      attendees?: Array<{ email: string; displayName?: string }>;
      location?: string;
    },
  ) {
    // conferenceDataVersion: 1 required for meeting link creation
    const resource: any = {
      summary: event.summary,
      description: event.description || '',
      start: event.start,
      end: event.end,
      attendees: event.attendees || [],
      reminders: { useDefault: true },
      // create a Google Meet link
      conferenceData: {
        createRequest: {
          requestId: 'meet-' + Date.now(), // unique per request
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    };

    const res = await this.calendar.events.insert({
      calendarId,
      requestBody: resource,
      conferenceDataVersion: 1,
      sendUpdates: 'all', // notify attendees by email
    });

    return res.data;
  }

  async deleteEvent(calendarId: string, eventId: string) {
    return this.calendar.events.delete({
      calendarId,
      eventId,
      sendUpdates: 'all', // or 'none' if you don't want emails
    });
  }

  // Helper to check a single interval for free
  async isSlotFree(calendarId: string, startISO: string, endISO: string) {
    const busy = await this.getBusySlots(calendarId, startISO, endISO);
    return busy.length === 0;
  }
}
