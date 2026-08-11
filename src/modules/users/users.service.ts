import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async create(dto: CreateUserDto) {
    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = new this.userModel({
      ...dto,
      password: hashedPassword,
    });
    return user.save();
  }

  async findAll(
    page: number,
    limit: number,
    role?: string,
    isActive?: boolean,
  ) {
    const query: any = {};
    if (role) query.role = role;
    if (isActive !== undefined) query.isActive = isActive;

    const data = await this.userModel
      .find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const count = await this.userModel.countDocuments(query);

    return { data, total: count, page, limit };
  }

  async findOne(id: string) {
    try {
      const user = await this.userModel
        .findById(id)
        .select('+refreshToken') // Include refreshToken in the result
        .maxTimeMS(2000) // 2 second timeout
        .exec();

      return user;
    } catch (error) {
      console.error('Error finding user:', error);
      return null; // Return null instead of throwing to prevent guard failures
    }
  }

  async findByEmail(email: string, withPassword = false) {
    const query = this.userModel.findOne({ email });
    if (withPassword) {
      query.select('+password +refreshToken');
    } else {
      query.select('+refreshToken');
    }
    return query.exec();
  }

  async setRefreshToken(userId: string, hashedToken: string) {
    try {
      const result = await this.userModel.findByIdAndUpdate(
        userId,
        { refreshToken: hashedToken },
        { new: true },
      );

      if (!result) {
        throw new Error(`User with ID ${userId} not found`);
      }

      return result;
    } catch (error) {
      console.error('Error setting refresh token:', error);
      throw new Error('Failed to set refresh token');
    }
  }

  async clearRefreshToken(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, { refreshToken: null });
  }

  async updateLastLogin(id: string) {
    await this.userModel.findByIdAndUpdate(id, { lastLogin: new Date() });
  }

  /** `hashedOtp` must already be bcrypt-hashed by the caller. */
  async saveOtp(email: string, hashedOtp: string, expires: Date) {
    await this.userModel.updateOne(
      { email },
      { otpCode: hashedOtp, otpExpires: expires },
    );
  }

  async clearOtp(email: string) {
    await this.userModel.updateOne(
      { email },
      { $unset: { otpCode: 1, otpExpires: 1 } },
    );
  }

  /**
   * Looks the user up by email and compares the OTP in application code rather
   * than putting the submitted value into the query. The previous version
   * matched `{ otpCode: otp }` directly, so a body of `{"otp": {"$gt": ""}}`
   * matched any stored OTP — the DTO now blocks that shape, and this keeps it
   * from being a query operator even if it ever got through.
   */
  async verifyOtp(email: string, otp: string) {
    const user = await this.userModel
      .findOne({ email })
      .select('+otpCode +otpExpires');

    if (!user?.otpCode || !user.otpExpires) return null;
    if (user.otpExpires.getTime() <= Date.now()) return null;

    const matches = await bcrypt.compare(otp, user.otpCode);
    return matches ? user : null;
  }

  async update(id: string, dto: UpdateUserDto) {
    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 10);
    }
    return this.userModel.findByIdAndUpdate(id, dto, { new: true });
  }

  async remove(id: string) {
    return this.userModel.findByIdAndDelete(id);
  }
}
