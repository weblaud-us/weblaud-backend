import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Estimate, EstimateDocument } from './schemas/estimate.schema';
import { CreateEstimateDto } from './dto/create-estimate.dto';
import { DashboardNotifierService } from '../mail/dashboard-notifier.service';
import { CalculatorConfigService } from '../calculator-config/calculator-config.service';
import { estimateProject } from './estimate.util';
import { LeadReplyService } from '../leads/lead-reply.service';
import { LEAD_STAGES, stageFilter } from '../leads/lead.constants';
import { sourceRows } from '../leads/lead-source.util';
import { buildPipelineUpdate } from '../leads/lead-pipeline.util';
import { UpdateLeadPipelineDto } from '../leads/dto/update-lead-pipeline.dto';

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

/** At most one emailed estimate per address per window — see ContactService. */
const AUTO_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class EstimatesService {
  private readonly logger = new Logger(EstimatesService.name);

  constructor(
    @InjectModel(Estimate.name)
    private readonly estimateModel: Model<EstimateDocument>,
    private readonly calculatorConfigService: CalculatorConfigService,
    private readonly dashboardNotifier: DashboardNotifierService,
    private readonly leadReply: LeadReplyService,
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
      attribution: dto.attribution,
      heardAbout: dto.heardAbout,
    });

    // Neither call rejects — the lead is already persisted and a mail outage
    // must not surface as a 500 to the visitor.
    await Promise.all([this.notifyAdmin(saved, dto), this.replyToLead(saved)]);

    return saved;
  }

  private async notifyAdmin(saved: EstimateDocument, dto: CreateEstimateDto) {
    const { selection, result } = saved;
    await this.dashboardNotifier.notifyNew({
      kind: 'project estimate',
      heading: `New project estimate — ${selection.projectTypeTitle}`,
      rows: [
        { label: 'Name', value: dto.name },
        { label: 'Email', value: dto.email, href: `mailto:${dto.email}` },
        { label: 'Company', value: dto.company },
        {
          label: 'Phone',
          value: dto.phone,
          href: dto.phone ? `tel:${dto.phone}` : undefined,
        },
        {
          section: 'Scope',
          label: 'Project type',
          value: selection.projectTypeTitle,
        },
        {
          section: 'Scope',
          label: 'Delivery pace',
          value: selection.speedLabel,
        },
        {
          section: 'Scope',
          label: 'Capabilities',
          // Falls back to explicit copy rather than dropping the row, so the
          // reader can tell "chose nothing" from "field is missing".
          value: selection.featureTitles.length
            ? selection.featureTitles
            : 'None selected',
        },
        {
          section: 'Estimate',
          label: 'Timeline',
          value: `${result.totalWeeks} sprint weeks`,
        },
        {
          section: 'Estimate',
          label: 'Investment range',
          value: `${money(result.costMin)} – ${money(result.costMax)}`,
        },
        { section: 'Notes', label: 'Notes', value: dto.notes },
        ...sourceRows(dto.attribution, dto.heardAbout),
      ],
      dashboardPath: '/estimate-submissions',
      recordId: String(saved._id),
    });
  }

  /** Emails the lead their own estimate. Never rejects. */
  private async replyToLead(saved: EstimateDocument) {
    try {
      const alreadyReplied = await this.estimateModel.exists({
        email: saved.email,
        autoReplySentAt: {
          $gte: new Date(Date.now() - AUTO_REPLY_WINDOW_MS),
        },
      });
      if (alreadyReplied) return;

      // Fields picked one by one: spreading a Mongoose subdocument copies its
      // internals ($__, _doc), not its values.
      const { selection, result } = saved;
      const sent = await this.leadReply.sendEstimateSummary(
        saved.email,
        saved.name,
        {
          projectTypeTitle: selection.projectTypeTitle,
          featureTitles: [...selection.featureTitles],
          speedLabel: selection.speedLabel,
          totalWeeks: result.totalWeeks,
          costMin: result.costMin,
          costMax: result.costMax,
        },
      );
      if (sent) {
        await this.estimateModel.updateOne(
          { _id: saved._id },
          { autoReplySentAt: new Date() },
        );
      }
    } catch (err) {
      this.logger.error(
        `Auto-reply bookkeeping for estimate ${String(saved._id)} failed`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async findAll(page = 1, limit = 20, status?: string, stage?: string) {
    const skip = (page - 1) * limit;
    // Was previously unfilterable — see the matching comment on
    // ContactService.findAll for why that mattered.
    const filter = {
      ...(status ? { status } : {}),
      ...(stage && (LEAD_STAGES as readonly string[]).includes(stage)
        ? stageFilter(stage)
        : {}),
    };

    const [items, total] = await Promise.all([
      this.estimateModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.estimateModel.countDocuments(filter),
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

  async updatePipeline(id: string, dto: UpdateLeadPipelineDto) {
    const updated = await this.estimateModel.findByIdAndUpdate(
      id,
      buildPipelineUpdate(dto),
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
