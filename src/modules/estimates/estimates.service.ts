import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { Estimate, EstimateDocument } from './schemas/estimate.schema';
import { CreateEstimateDto } from './dto/create-estimate.dto';
import { MailService } from '../mail/mail.service';
import { CalculatorConfigService } from '../calculator-config/calculator-config.service';
import { estimateProject } from './estimate.util';

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

@Injectable()
export class EstimatesService {
  private readonly logger = new Logger(EstimatesService.name);

  constructor(
    @InjectModel(Estimate.name)
    private readonly estimateModel: Model<EstimateDocument>,
    private readonly calculatorConfigService: CalculatorConfigService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  async submit(dto: CreateEstimateDto) {
    const config = await this.calculatorConfigService.getPublic();

    if (!config.projectTypes?.length || !config.timelineSpeeds?.length) {
      throw new BadRequestException(
        'The estimator is not configured yet. Please try again later.',
      );
    }

    const projectType = config.projectTypes.find(
      (p) => p.id === dto.projectTypeId,
    );
    if (!projectType) {
      throw new BadRequestException(`Unknown project type: ${dto.projectTypeId}`);
    }

    const speed = config.timelineSpeeds.find((s) => s.id === dto.speedId);
    if (!speed) {
      throw new BadRequestException(`Unknown delivery pace: ${dto.speedId}`);
    }

    const unknownFeature = dto.featureIds.find(
      (id) => !config.features.some((f) => f.id === id),
    );
    if (unknownFeature) {
      throw new BadRequestException(`Unknown capability: ${unknownFeature}`);
    }

    const computed = estimateProject(config, {
      projectTypeId: dto.projectTypeId,
      featureIds: dto.featureIds,
      speedId: dto.speedId,
    });

    const saved = await this.estimateModel.create({
      name: dto.name,
      email: dto.email,
      company: dto.company,
      phone: dto.phone,
      notes: dto.notes,
      selection: {
        projectTypeId: projectType.id,
        projectTypeTitle: projectType.title,
        featureIds: computed.features.map((f) => f.id),
        featureTitles: computed.features.map((f) => f.title),
        speedId: speed.id,
        speedLabel: speed.label,
      },
      result: {
        totalWeeks: computed.totalWeeks,
        costMin: computed.costMin,
        costMax: computed.costMax,
      },
    });

    // A failed notification must not lose the lead — it is already persisted.
    try {
      await this.mailService.sendEmail({
        to: this.config.get<string>('mail.admin')!,
        subject: `New Project Estimate — ${projectType.title}`,
        template: 'estimate',
        context: {
          name: dto.name,
          email: dto.email,
          company: dto.company,
          phone: dto.phone,
          notes: dto.notes,
          projectType: projectType.title,
          features: computed.features.map((f) => f.title),
          speed: speed.label,
          totalWeeks: computed.totalWeeks,
          costMin: money(computed.costMin),
          costMax: money(computed.costMax),
          date: new Date().toUTCString(),
        },
      });
    } catch (err) {
      this.logger.error(
        `Estimate ${saved._id as string} saved but notification email failed`,
        err instanceof Error ? err.stack : String(err),
      );
    }

    return saved;
  }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.estimateModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.estimateModel.countDocuments(),
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

  async markRead(id: string) {
    const updated = await this.estimateModel.findByIdAndUpdate(
      id,
      { status: 'read' },
      { new: true },
    );

    if (!updated) throw new NotFoundException('Estimate not found');

    return updated;
  }

  async delete(id: string) {
    const deleted = await this.estimateModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('Estimate not found');
    return { deleted: true };
  }
}
