import { JwtModuleOptions } from '@nestjs/jwt';
import { StringValue } from 'jsonwebtoken';

export const jwtConfig = (): JwtModuleOptions => ({
  secret: process.env.JWT_SECRET,
  signOptions: {
    expiresIn:
      (process.env.JWT_EXPIRES_IN as StringValue) || ('15m' as StringValue),
  },
});
