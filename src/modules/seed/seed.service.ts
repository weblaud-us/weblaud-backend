import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Role } from 'src/common/enum/user.role.enum';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.seedAdminUser();
  }

  private async seedAdminUser() {
    try {
      const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
      const adminPassword = this.configService.get<string>('ADMIN_PASSWORD');
      const firstName = this.configService.get<string>(
        'ADMIN_FIRST_NAME',
        'Admin',
      );
      const lastName = this.configService.get<string>(
        'ADMIN_LAST_NAME',
        'User',
      );

      // Validate required environment variables
      if (!adminEmail || !adminPassword) {
        this.logger.warn(
          'Admin seeding skipped: ADMIN_EMAIL or ADMIN_PASSWORD not configured in environment variables',
        );
        return;
      }

      // Check if admin user already exists
      const existingAdmin = await this.userModel.findOne({ email: adminEmail });

      if (existingAdmin) {
        this.logger.log(
          `Admin user already exists (${adminEmail}), skipping creation`,
        );
        return;
      }

      // Create admin user
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      const admin = await this.userModel.create({
        firstName,
        lastName,
        email: adminEmail,
        password: hashedPassword,
        role: Role.ADMIN,
        isActive: true,
      });

      this.logger.log(
        `Admin user created successfully: ${admin.email} (ID: ${admin._id})`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to seed admin user:',
        error.message || error,
      );
      // Don't throw - allow application to continue starting
    }
  }
}
