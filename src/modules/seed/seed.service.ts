import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Career, CareerDocument } from '../career/schemas/career.schema';
import { Role } from 'src/common/enum/user.role.enum';
import { CAREER_SEED } from './seed.careers';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Career.name) private careerModel: Model<CareerDocument>,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.seedAdminUser();
    await this.seedCareers();
  }

  /**
   * Seeds the job circulars, keyed by slug rather than gated on an empty
   * collection — the collection already held a posting predating the slug
   * field, so an "only if empty" guard would have skipped seeding forever.
   * Uses $setOnInsert so an admin editing or closing a posting is never
   * overwritten on restart.
   */
  private async seedCareers() {
    try {
      await this.backfillCareerSlugs();

      // Applications close 45 days out. Computed rather than hardcoded so a
      // first deploy never ships a posting whose deadline has already passed.
      const deadline = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);

      let inserted = 0;

      for (const job of CAREER_SEED) {
        const result = await this.careerModel.updateOne(
          { slug: job.slug },
          { $setOnInsert: { ...job, deadline } },
          { upsert: true },
        );

        if (result.upsertedCount) inserted++;
      }

      this.logger.log(
        inserted > 0
          ? `Seeded ${inserted} career posting(s)`
          : 'Career postings already present, nothing to seed',
      );
    } catch (error) {
      this.logger.error('Failed to seed careers:', error.message || error);
      // Don't throw - allow application to continue starting
    }
  }

  /**
   * Postings created before `slug` existed have no value for it, which both
   * breaks their public detail URL and collides on the unique slug index once
   * a second such document appears. Derive one from the title.
   */
  private async backfillCareerSlugs() {
    const legacy = await this.careerModel
      .find({ $or: [{ slug: { $exists: false } }, { slug: '' }] })
      .select('_id title');

    if (legacy.length === 0) return;

    for (const job of legacy) {
      const base =
        job.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'position';

      let slug = base;
      let suffix = 2;

      while (await this.careerModel.exists({ slug, _id: { $ne: job._id } })) {
        slug = `${base}-${suffix++}`;
      }

      await this.careerModel.updateOne({ _id: job._id }, { $set: { slug } });
      this.logger.log(`Backfilled slug "${slug}" on career ${String(job._id)}`);
    }
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
