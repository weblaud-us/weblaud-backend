import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Approval,
  ApprovalDocument,
  ApprovalStatus,
} from './schemas/approval.schema';
import { CreateApprovalDto } from './dto/create-approval.dto';
import { DecideApprovalDto } from './dto/decide-approval.dto';
import { ClientProjectService } from 'src/modules/client-project/client-project.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import { AuditLogService } from 'src/modules/audit-log/audit-log.service';
import {
  assertProjectAccess,
  assertProjectManager,
  ProjectAccessActor,
} from 'src/common/utils/project-access.util';
import { Role } from 'src/common/enum/user.role.enum';
import { OrgRole } from 'src/common/enum/org-role.enum';
import { portalProjectLink } from 'src/common/utils/portal-links.util';

interface Actor extends ProjectAccessActor {
  orgRole?: OrgRole;
}

@Injectable()
export class ApprovalService {
  constructor(
    @InjectModel(Approval.name) private readonly model: Model<ApprovalDocument>,
    private readonly projects: ClientProjectService,
    private readonly notifications: NotificationService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** PM (or admin) requests a sign-off — staff decide what needs client approval, not the reverse. */
  async create(projectId: string, dto: CreateApprovalDto, actor: Actor) {
    const subject = await this.projects.findAccessSubject(projectId);
    assertProjectAccess(subject, actor);
    assertProjectManager(subject, actor);

    const approval = await this.model.create({
      ...dto,
      project: projectId,
      requestedBy: actor._id,
    });

    const clientIds = await this.projects.getClientUserIds(
      subject.organization.toString(),
    );
    await this.notifications.notifyMany(clientIds, {
      type: 'approval_requested',
      title: `Approval needed: ${approval.title}`,
      link: portalProjectLink(projectId, 'approvals'),
      email: {
        category: 'approvals',
        subject: `Approval needed: ${approval.title}`,
        template: 'approval-requested',
        context: { approvalTitle: approval.title, projectName: subject.name },
      },
    });

    return approval;
  }

  /**
   * Flat, cross-project list scoped to what `actor` can see — mirrors
   * ContractService/InvoiceService's findForPortalUser. Unlike those two,
   * Approval has no `organization` field of its own (only `project`), so
   * every role (including a client) is scoped via their visible project ids
   * rather than a direct org filter. Powers GET /portal/approvals and the
   * portal dashboard's "needs your attention" rollup.
   */
  async findForPortalUser(actor: Actor) {
    const query: Record<string, unknown> = {};
    if (actor.role !== Role.ADMIN) {
      const myProjects = await this.projects.findForPortalUser(actor);
      query.project = { $in: myProjects.map((p) => p._id) };
    }

    return this.model
      .find(query)
      .sort({ createdAt: -1 })
      .populate({
        path: 'project',
        select: 'name organization',
        populate: { path: 'organization', select: 'name' },
      })
      .populate('requestedBy', 'firstName lastName')
      .populate('decidedBy', 'firstName lastName')
      .lean();
  }

  async findForProject(projectId: string, actor: Actor) {
    const subject = await this.projects.findAccessSubject(projectId);
    assertProjectAccess(subject, actor);
    return this.model
      .find({ project: projectId })
      .sort({ createdAt: -1 })
      .populate('requestedBy', 'firstName lastName')
      .populate('decidedBy', 'firstName lastName')
      .lean();
  }

  /**
   * Cross-project admin view — every approval, regardless of project. Only
   * a client_admin can act on one (see assertCanDecide); this is read-only
   * visibility for the agency into what's sitting in a client's queue.
   */
  async findAllForAdmin() {
    return this.model
      .find()
      .sort({ createdAt: -1 })
      .populate({
        path: 'project',
        select: 'name organization',
        populate: { path: 'organization', select: 'name' },
      })
      .populate('requestedBy', 'firstName lastName')
      .populate('decidedBy', 'firstName lastName')
      .lean();
  }

  private async findAccessible(
    id: string,
    actor: Actor,
  ): Promise<ApprovalDocument> {
    const approval = await this.model.findById(id);
    if (!approval) throw new NotFoundException('Approval not found');
    const subject = await this.projects.findAccessSubject(
      approval.project.toString(),
    );
    assertProjectAccess(subject, actor);
    return approval;
  }

  /** Only a client_admin can sign off on the agency's behalf-facing decisions. */
  private assertCanDecide(actor: Actor) {
    if (actor.role === Role.ADMIN) return;
    if (actor.role === Role.USER && actor.orgRole === OrgRole.CLIENT_ADMIN)
      return;
    throw new ForbiddenException(
      'Only a client admin can decide on an approval',
    );
  }

  async approve(id: string, dto: DecideApprovalDto, actor: Actor) {
    const approval = await this.findAccessible(id, actor);
    this.assertCanDecide(actor);
    if (approval.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException('This approval has already been decided');
    }

    approval.status = ApprovalStatus.APPROVED;
    approval.decidedBy = actor._id as any;
    approval.decidedAt = new Date();
    approval.comment = dto.comment;
    await approval.save();

    await this.notifications.notify({
      user: approval.requestedBy,
      type: 'approval_approved',
      title: `Approved: ${approval.title}`,
      link: portalProjectLink(approval.project, 'approvals'),
    });

    await this.auditLog.record({
      actor: actor._id!.toString(),
      action: 'approval.approved',
      entityType: 'Approval',
      entityId: id,
    });

    return approval;
  }

  async reject(id: string, dto: DecideApprovalDto, actor: Actor) {
    const approval = await this.findAccessible(id, actor);
    this.assertCanDecide(actor);
    if (approval.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException('This approval has already been decided');
    }

    approval.status = ApprovalStatus.REJECTED;
    approval.decidedBy = actor._id as any;
    approval.decidedAt = new Date();
    approval.comment = dto.comment;
    await approval.save();

    await this.notifications.notify({
      user: approval.requestedBy,
      type: 'approval_rejected',
      title: `Rejected: ${approval.title}`,
      body: dto.comment,
      link: portalProjectLink(approval.project, 'approvals'),
    });

    await this.auditLog.record({
      actor: actor._id!.toString(),
      action: 'approval.rejected',
      entityType: 'Approval',
      entityId: id,
    });

    return approval;
  }
}
