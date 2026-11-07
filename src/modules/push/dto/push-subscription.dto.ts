import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class PushKeysDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  auth: string;
}

/** The browser's PushSubscription.toJSON(), plus the device's user agent. */
export class SubscribePushDto {
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  @MaxLength(1000)
  endpoint: string;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  userAgent?: string;
}

export class UnsubscribePushDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  endpoint: string;
}
