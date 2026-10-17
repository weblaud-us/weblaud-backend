import { IsNotEmpty, IsString } from 'class-validator';

/** A rejection without a reason leaves the developer nothing to act on — required, not optional. */
export class RejectProjectUpdateDto {
  @IsNotEmpty()
  @IsString()
  reviewNote: string;
}
