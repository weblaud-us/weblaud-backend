import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AcceptContractDto {
  /** Typed full legal name — the client's e-signature for v1. */
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  name: string;

  /** Optional drawn signature, a data URL from a canvas element. */
  @IsOptional()
  @IsString()
  signatureImage?: string;
}
