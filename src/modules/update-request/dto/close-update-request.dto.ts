import { IsOptional, IsString } from 'class-validator';

/**
 * Optional at the DTO level — UpdateRequestService.close() serves two
 * different closers with two different rules: the PM answering the
 * question (response required) and the original requester tidying up
 * their own no-longer-relevant question (no response needed). The service
 * enforces which applies; the DTO just carries whatever was sent.
 */
export class CloseUpdateRequestDto {
  @IsOptional()
  @IsString()
  response?: string;
}
