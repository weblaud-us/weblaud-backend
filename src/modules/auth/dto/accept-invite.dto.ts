import { IsMongoId, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AcceptInviteDto {
  /** User id from the invite link's ?uid= param. */
  @IsMongoId()
  uid: string;

  /** Raw token from the invite link's ?token= param — compared against the bcrypt hash in application code. */
  @IsNotEmpty()
  @IsString()
  token: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  password: string;
}
