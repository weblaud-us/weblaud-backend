import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * First-touch marketing attribution, captured by the website in a cookie on
 * the visitor's first public page view and forwarded with whichever form they
 * eventually submit. Every field is visitor-supplied, so treat it as untrusted
 * display text.
 */
@Schema({ _id: false })
export class LeadAttribution {
  @Prop()
  utmSource?: string;

  @Prop()
  utmMedium?: string;

  @Prop()
  utmCampaign?: string;

  /** External referrer only — same-site navigation is not recorded. */
  @Prop()
  referrer?: string;

  /** Path of the first page seen, e.g. "/vs/in-house-engineers". */
  @Prop()
  landingPath?: string;
}

export const LeadAttributionSchema =
  SchemaFactory.createForClass(LeadAttribution);
