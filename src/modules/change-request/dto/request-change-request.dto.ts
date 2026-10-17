import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** No price here — a client asking for scope doesn't set the cost, a PM does (see QuoteChangeRequestDto). See ChangeRequestService.requestFromClient. */
export class RequestChangeRequestDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;
}
