import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;
}

// RegisterDto intentionally removed alongside the public register route — see
// the comment on AuthController. Admin accounts are created through
// POST /users (admin-gated) or the first-boot seed.
