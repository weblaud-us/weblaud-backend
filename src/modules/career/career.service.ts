import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { format } from 'fast-csv';
import { Model, Types } from 'mongoose';
import { UploadService } from '@weblaud/upload-pro';
import { MailService } from '../mail/mail.service';
import { Career } from './schemas/career.schema';
import { Application } from './schemas/application.schema';
import { CreateCareerDto } from './dto/create-career.dto';
import { SubmitApplicationDto } from './dto/submit-application.dto';
import { sanitizeCsvRow } from 'src/common/utils/csv.util';

@Injectable()
export class CareerService {
  private readonly logger = new Logger(CareerService.name);

  constructor(
    @InjectModel(Career.name) private careerModel: Model<Career>,
    @InjectModel(Application.name) private appModel: Model<Application>,
    private readonly uploadService: UploadService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  async handleGoogleApplicant(googleUser: any) {
    const { email, firstName, lastName, avatar } = googleUser;

    // Check if an unfinished application exists by email and missing required fields
    let app = await this.appModel.findOne({ email, phone: { $exists: false } });

    if (!app) {
      // Create a blank application if user starts via Google
      app = await this.appModel.create({
        email,
        name: `${firstName} ${lastName}`,
        // avatarUrl: avatar, // Removed from schema
        // currentStep: 1, // Removed from schema
      });
    } else {
      // Update Step1 auto-fill fields
      app.name = `${firstName} ${lastName}`;
      // app.avatarUrl = avatar;
      await app.save();
    }

    return {
      message: 'Google login successful',
      applicationId: app._id,
      profile: { firstName, lastName, email, avatar },
    };
  }

  // ---------- Helper to fix url/path union ----------
  private getFileUrl(upload: any): string {
    return upload.url ?? upload.path ?? '';
  }

  // ---------------------------------------------------
  // JOBS
  // ---------------------------------------------------

  async createCareer(dto: CreateCareerDto) {
    try {
      return await this.careerModel.create(dto);
    } catch {
      throw new InternalServerErrorException('Failed to create career');
    }
  }

  listCareers() {
    return this.careerModel.find({ isActive: true }).sort({ createdAt: -1 });
  }

  async getCareer(id: string) {
    const job = await this.careerModel.findById(id);
    if (!job) throw new NotFoundException('Career not found');
    return job;
  }

  // ---------------------------------------------------
  // APPLICATION FLOW
  // ---------------------------------------------------

  // ---------------------------------------------------
  // APPLICATION FLOW
  // ---------------------------------------------------

  async submitApplication(
    careerId: string,
    dto: SubmitApplicationDto,
    resume: Express.Multer.File,
  ) {
    const career = await this.careerModel.findById(careerId);
    if (!career) throw new NotFoundException('Career not found');

    if (!resume) throw new BadRequestException('Resume upload is required');

    const upload = await this.uploadService.upload(resume, {
      folder: 'career-resumes',
    });
    const resumeUrl = this.getFileUrl(upload);

    const app = await this.appModel.create({
      careerId: new Types.ObjectId(careerId),
      ...dto,
      resumeUrl,
      status: 'new',
    });

    // mail.hr falls back to mail.admin, which validateEnv requires — so this is
    // always set. It used to read an undefined config key and silently skip.
    const hrEmail = this.config.get<string>('mail.hr');

    try {
      await this.mailService.sendEmail({
        to: hrEmail!,
        subject: `New Application – ${career.title}`,
        template: 'application-submitted',
        context: {
          jobTitle: career.title,
          name: app.name,
          email: app.email,
        },
      });
    } catch (err) {
      this.logger.error(
        `Application ${String(app._id)} saved but notification email failed`,
        err instanceof Error ? err.stack : String(err),
      );
    }

    return app;
  }

  async getApplication(id: string) {
    const app = await this.appModel
      .findById(id)
      .populate('careerId', 'title position')
      .lean();

    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  // ---------------------------------------------------
  // ADMIN APPLICANT LISTING (same controller)
  // ---------------------------------------------------

  async listApplicants(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const filter: any = {};

    if (query.careerId) filter.careerId = query.careerId;
    if (query.email) filter.email = new RegExp(query.email, 'i');
    if (query.startDate || query.endDate) {
      filter.createdAt = {};
      if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
      if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
    }

    const [items, total] = await Promise.all([
      this.appModel
        .find(filter)
        .populate('careerId', 'title position')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean(),
      this.appModel.countDocuments(filter),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateStatus(id: string, status: string) {
    const allowed = ['new', 'review', 'shortlisted', 'rejected', 'hired'];
    if (!allowed.includes(status)) {
      throw new BadRequestException('Invalid status value');
    }

    const app = await this.appModel.findById(id);
    if (!app) throw new NotFoundException('Applicant not found');

    app.status = status;
    await app.save();

    return { message: 'Status updated', status };
  }

  //Helper
  async listApplicantsRaw(query: any) {
    const filter: any = {};

    if (query.careerId) filter.careerId = query.careerId;
    if (query.email) filter.email = new RegExp(query.email, 'i');
    // if (query.submitted !== undefined)
    //   filter.submitted = query.submitted === 'true';
    // if (query.step) filter.currentStep = Number(query.step);

    return this.appModel
      .find(filter)
      .populate('careerId', 'title position')
      .sort({ createdAt: -1 })
      .lean();
  }

  async exportCsv(data: any[], res: any) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=applicants.csv');

    const csv = format({ headers: true });
    csv.pipe(res);

    // Every field here except Status originates from an unauthenticated public
    // submission, and the export is opened in a spreadsheet by an admin.
    data.forEach((row) => {
      csv.write(
        sanitizeCsvRow({
          Name: row.name,
          Email: row.email,
          Phone: row.phone,
          Status: row.status,
          Position: row.careerId?.title,
          Date: row.createdAt,
        }),
      );
    });

    csv.end();
  }
}
