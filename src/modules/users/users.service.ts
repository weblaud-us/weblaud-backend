import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async create(dto: CreateUserDto) {
    return this.userModel.create(dto);
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
    const user = await this.userModel.findById(id).lean();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string, withPassword = false) {
    const query = this.userModel.findOne({ email });
    if (withPassword) query.select('+password');
    return query;
  }

  async setRefreshToken(userId: string, hashedToken: string) {
    await this.userModel.findByIdAndUpdate(userId, {
      refreshToken: hashedToken,
    });
  }

  async clearRefreshToken(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, { refreshToken: null });
  }

  async updateLastLogin(id: string) {
    await this.userModel.findByIdAndUpdate(id, { lastLogin: new Date() });
  }

  async saveOtp(email: string, otpCode: string, expires: Date) {
    await this.userModel.updateOne({ email }, { otpCode, otpExpires: expires });
  }

  async verifyOtp(email: string, otp: string) {
    return this.userModel.findOne({
      email,
      otpCode: otp,
      otpExpires: { $gt: new Date() },
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    return this.userModel.findByIdAndUpdate(id, dto, { new: true });
  }

  async remove(id: string) {
    return this.userModel.findByIdAndDelete(id);
  }
}
