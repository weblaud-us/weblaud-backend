import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Role } from 'src/common/enum/user.role.enum';


export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
    _id: any;
    
  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ unique: true, required: true })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ enum: Role, default: Role.USER })
  role: Role;

  @Prop({ default: true })
  isActive: boolean;

  // hashed refresh token
  @Prop({ select: false })
  refreshToken?: string;

  // Bcrypt hash of the password-reset OTP, never the code itself. select:false
  // keeps both out of every user response by default — they were previously
  // returned by GET /users/me and any other endpoint echoing a user document.
  @Prop({ select: false })
  otpCode?: string;

  @Prop({ select: false })
  otpExpires?: Date;

  comparePassword: (password: string) => Promise<boolean>;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Add method
UserSchema.methods.comparePassword = async function (plain: string) {
  return bcrypt.compare(plain, this.password);
};
