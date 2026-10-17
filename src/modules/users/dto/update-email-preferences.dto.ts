import { IsBoolean, IsOptional } from 'class-validator';

/** Self-service toggle for each transactional-email category — see User.emailPreferences and NotificationService's `email` option. */
export class UpdateEmailPreferencesDto {
  @IsOptional()
  @IsBoolean()
  contracts?: boolean;

  @IsOptional()
  @IsBoolean()
  invoices?: boolean;

  @IsOptional()
  @IsBoolean()
  approvals?: boolean;

  @IsOptional()
  @IsBoolean()
  changeRequests?: boolean;

  @IsOptional()
  @IsBoolean()
  updates?: boolean;

  @IsOptional()
  @IsBoolean()
  mentions?: boolean;

  @IsOptional()
  @IsBoolean()
  digest?: boolean;
}
