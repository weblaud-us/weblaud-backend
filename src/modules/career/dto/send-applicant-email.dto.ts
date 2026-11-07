import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

/** Statuses an admin can move an applicant to while emailing them. */
export const EMAIL_STATUS_CHANGES = [
  'review',
  'shortlisted',
  'rejected',
  'hired',
] as const;

export class SendApplicantEmailDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;

  /** Link to the assignment (Google Doc, Notion, GitHub repo...). */
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2000)
  taskUrl?: string;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  /**
   * The sender's IANA zone (from their browser), so "Due: Fri, Nov 14, 5:00 PM
   * GMT+6" in the email means what the admin picked. Falls back to UTC.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string;

  @IsOptional()
  @IsIn(EMAIL_STATUS_CHANGES)
  setStatus?: (typeof EMAIL_STATUS_CHANGES)[number];
}
