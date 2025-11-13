import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { format } from 'fast-csv';
import { Model, Types } from 'mongoose';

import { UploadService } from '../upload/upload.service';
import { MailService } from '../mail/mail.service';

import { Career } from './schemas/career.schema';
import { Application } from './schemas/application.schema';

import { CreateCareerDto } from './dto/create-career.dto';
import { Step1Dto } from './dto/step1.dto';
import { Step2Dto } from './dto/step2.dto';
import { Step3Dto } from './dto/step3.dto';
import { Step4Dto } from './dto/step4.dto';

@Injectable()
export class CareerService {
  constructor(
    @InjectModel(Career.name) private careerModel: Model<Career>,
    @InjectModel(Application.name) private appModel: Model<Application>,
    private readonly uploadService: UploadService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

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

  async startApplication(careerId: string) {
    const exists = await this.careerModel.exists({ _id: careerId });
    if (!exists) throw new NotFoundException('Career not found');

    return this.appModel.create({
      careerId: new Types.ObjectId(careerId),
      currentStep: 1,
    });
  }

  async getApplication(id: string) {
    const app = await this.appModel
      .findById(id)
      .populate('careerId', 'title position')
      .lean();

    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  // -------------------- STEP 1 --------------------
  async saveStep1(id: string, dto: Step1Dto, avatar?: Express.Multer.File) {
    const app = await this.appModel.findById(id);
    if (!app) throw new NotFoundException('Application not found');

    if (avatar) {
      const upload = await this.uploadService.upload(avatar);
      dto.avatarUrl = this.getFileUrl(upload);
    }

    Object.assign(app, dto);
    app.currentStep = 1;
    await app.save();

    return app;
  }

  // -------------------- STEP 2 --------------------
  async saveStep2(id: string, dto: Step2Dto) {
    const app = await this.appModel.findById(id);
    if (!app) throw new NotFoundException('Application not found');

    Object.assign(app, dto);
    app.currentStep = 2;

    await app.save();
    return app;
  }

  // -------------------- STEP 3 --------------------
  async saveStep3(id: string, dto: Step3Dto) {
    const app = await this.appModel.findById(id);
    if (!app) throw new NotFoundException('Application not found');

    Object.assign(app, dto);
    app.currentStep = 3;

    await app.save();
    return app;
  }

  // -------------------- STEP 4 (Final) --------------------
  async saveStep4(id: string, dto: Step4Dto, resume: Express.Multer.File) {
    const app = await this.appModel.findById(id);
    if (!app) throw new NotFoundException('Application not found');

    if (!resume) throw new NotFoundException('Resume upload is required');

    const upload = await this.uploadService.upload(resume);
    dto.resumeUrl = this.getFileUrl(upload);

    Object.assign(app, dto);
    app.currentStep = 4;
    app.submitted = true;

    await app.save();

    // Fetch job for email
    const career = await this.careerModel.findById(app.careerId);
    if (!career) throw new NotFoundException('Career info missing');

    const hrEmail = this.config.get('mail.hr');
    if (hrEmail) {
      await this.mailService.sendEmail({
        to: hrEmail,
        subject: `New Application – ${career.title}`,
        template: 'application-submitted',
        context: {
          jobTitle: career.title,
          name: `${app.firstName} ${app.lastName}`,
          email: app.email,
        },
      });
    }

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
    if (query.submitted !== undefined)
      filter.submitted = query.submitted === 'true';
    if (query.step) filter.currentStep = Number(query.step);

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
    if (query.submitted !== undefined)
      filter.submitted = query.submitted === 'true';
    if (query.step) filter.currentStep = Number(query.step);

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

    data.forEach((row) => {
      csv.write({
        Name: `${row.firstName} ${row.lastName}`,
        Email: row.email,
        Phone: row.phone,
        Status: row.status,
        Position: row.careerId?.title,
        Submitted: row.submitted ? 'Yes' : 'No',
        Date: row.createdAt,
      });
    });

    csv.end();
  }
}
