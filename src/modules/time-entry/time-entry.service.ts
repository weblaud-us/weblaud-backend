import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TimeEntry, TimeEntryDocument } from './schemas/time-entry.schema';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { GenerateInvoiceFromTimeDto } from './dto/generate-invoice-from-time.dto';
import {
  ClientProject,
  ClientProjectDocument,
} from 'src/modules/client-project/schemas/client-project.schema';
import { User, UserDocument } from 'src/modules/users/schemas/user.schema';
import { ClientProjectService } from 'src/modules/client-project/client-project.service';
import { InvoiceService } from 'src/modules/invoice/invoice.service';
import {
  assertProjectAccess,
  isProjectManager,
  ProjectAccessActor,
} from 'src/common/utils/project-access.util';

const USER_PICK = 'firstName lastName avatar';

@Injectable()
export class TimeEntryService {
  constructor(
    @InjectModel(TimeEntry.name)
    private readonly model: Model<TimeEntryDocument>,
    @InjectModel(ClientProject.name)
    private readonly projectModel: Model<ClientProjectDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly projects: ClientProjectService,
    private readonly invoices: InvoiceService,
  ) {}

  /** Always logged against the caller — see the schema comment on why there's no "log time for someone else". */
  async create(
    projectId: string,
    dto: CreateTimeEntryDto,
    actor: ProjectAccessActor,
  ) {
    const subject = await this.projects.findAccessSubject(projectId);
    assertProjectAccess(subject, actor);

    const entry = await this.model.create({
      project: projectId,
      task: dto.task,
      user: actor._id,
      date: dto.date,
      minutes: dto.minutes,
      note: dto.note,
      billable: dto.billable,
    });
    return this.populate(entry);
  }

  /** PM/admin see the whole project's logged time; a team member sees only their own — see the schema's doc comment on why this never reaches a client at all. */
  async findForProject(projectId: string, actor: ProjectAccessActor) {
    const subject = await this.projects.findAccessSubject(projectId);
    assertProjectAccess(subject, actor);

    const query: Record<string, unknown> = { project: projectId };
    if (!isProjectManager(subject, actor)) query.user = actor._id;

    return this.model
      .find(query)
      .sort({ date: -1 })
      .populate('user', USER_PICK)
      .populate('task', 'title')
      .lean();
  }

  async update(id: string, dto: UpdateTimeEntryDto, actor: ProjectAccessActor) {
    const entry = await this.findEditable(id, actor);
    Object.assign(entry, dto);
    await entry.save();
    return this.populate(entry);
  }

  async remove(id: string, actor: ProjectAccessActor) {
    const entry = await this.findEditable(id, actor);
    await entry.deleteOne();
    return { deleted: true };
  }

  private async populate(entry: TimeEntryDocument) {
    return this.model
      .findById(entry._id)
      .populate('user', USER_PICK)
      .populate('task', 'title');
  }

  private async findEditable(
    id: string,
    actor: ProjectAccessActor,
  ): Promise<TimeEntryDocument> {
    const entry = await this.model.findById(id);
    if (!entry) throw new NotFoundException('Time entry not found');

    const subject = await this.projects.findAccessSubject(
      entry.project.toString(),
    );
    assertProjectAccess(subject, actor);

    const isOwner = entry.user.toString() === actor._id?.toString();
    if (!isOwner && !isProjectManager(subject, actor)) {
      throw new ForbiddenException('You can only edit your own time entries');
    }
    if (entry.invoiced) {
      throw new BadRequestException(
        'This entry has already been billed and can no longer be edited',
      );
    }
    return entry;
  }

  /**
   * The billing bridge: turns a batch of unbilled, billable entries into a
   * draft invoice, one line item per contributor (hours × their billRate —
   * never their costRate, see the schema comment on User.billRate).
   * Admin-only at the controller, mirroring every other "create an invoice"
   * action in the system.
   *
   * Refuses outright — before creating anything — if any contributor has no
   * billRate configured. A missing rate used to silently fall back to 0,
   * producing a $0.00 invoice and then permanently locking the entries as
   * invoiced (see findEditable's invoiced guard, and InvoiceService.void/
   * delete for the unlock path that undoes that lock if this ever slips
   * through and the resulting invoice gets voided).
   */
  async generateInvoice(dto: GenerateInvoiceFromTimeDto, actorId: string) {
    const entries = await this.model.find({
      _id: { $in: dto.entryIds },
      invoiced: false,
      billable: true,
    });
    if (entries.length !== dto.entryIds.length) {
      throw new BadRequestException(
        'One or more entries were not found, have already been billed, or are marked non-billable',
      );
    }
    if (entries.some((e) => e.project.toString() !== dto.projectId)) {
      throw new BadRequestException(
        'All entries must belong to the same project',
      );
    }

    const project = await this.projectModel
      .findById(dto.projectId)
      .select('organization budget.currency');
    if (!project) throw new NotFoundException('Project not found');

    const minutesByUser = new Map<string, number>();
    for (const entry of entries) {
      const userId = entry.user.toString();
      minutesByUser.set(
        userId,
        (minutesByUser.get(userId) ?? 0) + entry.minutes,
      );
    }

    const users = await this.userModel
      .find({ _id: { $in: [...minutesByUser.keys()] } })
      .select('firstName lastName title +billRate');

    // Checked before any write happens — an admin needs the names, not a
    // vague "something's wrong", and nothing should be created (invoice or
    // otherwise) out of a batch that's about to bill some of it for free.
    const missingRate = users.filter((u) => u.billRate == null);
    if (missingRate.length > 0) {
      const names = missingRate
        .map((u) => `${u.firstName} ${u.lastName}`)
        .join(', ');
      throw new BadRequestException(
        `Set a bill rate for the following before generating this invoice: ${names}`,
      );
    }

    const lineItems = users.map((user) => {
      const hours =
        Math.round(((minutesByUser.get(user._id.toString()) ?? 0) / 60) * 100) /
        100;
      return {
        // Role/title, not the individual's name — an invoice is a document
        // the client keeps, not an internal staffing record.
        description: `${user.title || 'Team member'} — ${hours}h logged`,
        qty: hours,
        unitPrice: user.billRate as number,
      };
    });

    const invoice = await this.invoices.createFromTimeEntries({
      organizationId: project.organization.toString(),
      projectId: dto.projectId,
      lineItems,
      currency: project.budget.currency,
      dueDate: dto.dueDate,
      createdBy: actorId,
    });

    await this.model.updateMany(
      { _id: { $in: dto.entryIds } },
      { invoiced: true, invoiceId: invoice._id },
    );

    return invoice;
  }
}
