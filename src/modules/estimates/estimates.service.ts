import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Estimate, EstimateDocument } from './schemas/estimate.schema';
import { CreateEstimateDto } from './dto/create-estimate.dto';
import { DashboardNotifierService } from '../mail/dashboard-notifier.service';
import { CalculatorConfigService } from '../calculator-config/calculator-config.service';
import { estimateProject } from './estimate.util';

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

@Injectable()
export class EstimatesService {
  constructor(
    @InjectModel(Estimate.name)
    private readonly estimateModel: Model<EstimateDocument>,
    private readonly calculatorConfigService: CalculatorConfigService,
    private readonly dashboardNotifier: DashboardNotifierService,
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
      throw new BadRequestException(
        `Unknown project type: ${dto.projectTypeId}`,
      );
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

    // notifyNew never rejects — the lead is already persisted and a mail outage
    // must not surface as a 500 to the visitor.
    await this.dashboardNotifier.notifyNew({
      kind: 'project estimate',
      heading: `New project estimate — ${projectType.title}`,
      rows: [
        { label: 'Name', value: dto.name },
        { label: 'Email', value: dto.email, href: `mailto:${dto.email}` },
        { label: 'Company', value: dto.company },
        {
          label: 'Phone',
          value: dto.phone,
          href: dto.phone ? `tel:${dto.phone}` : undefined,
        },
        { section: 'Scope', label: 'Project type', value: projectType.title },
        { section: 'Scope', label: 'Delivery pace', value: speed.label },
        {
          section: 'Scope',
          label: 'Capabilities',
          // Falls back to explicit copy rather than dropping the row, so the
          // reader can tell "chose nothing" from "field is missing".
          value: computed.features.length
            ? computed.features.map((f) => f.title)
            : 'None selected',
        },
        {
          section: 'Estimate',
          label: 'Timeline',
          value: `${computed.totalWeeks} sprint weeks`,
        },
        {
          section: 'Estimate',
          label: 'Investment range',
          value: `${money(computed.costMin)} – ${money(computed.costMax)}`,
        },
        { section: 'Notes', label: 'Notes', value: dto.notes },
      ],
      dashboardPath: '/estimate-submissions',
      recordId: String(saved._id),
    });

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
