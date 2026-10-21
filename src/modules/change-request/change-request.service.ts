import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ChangeRequest,
  ChangeRequestDocument,
  ChangeRequestStatus,
} from './schemas/change-request.schema';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { RejectChangeRequestDto } from './dto/reject-change-request.dto';
import { RequestChangeRequestDto } from './dto/request-change-request.dto';
import { QuoteChangeRequestDto } from './dto/quote-change-request.dto';
import { ClientProjectService } from 'src/modules/client-project/client-project.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import { AuditLogService } from 'src/modules/audit-log/audit-log.service';
import { InvoiceService } from 'src/modules/invoice/invoice.service';
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
export class ChangeRequestService {
  constructor(
    @InjectModel(ChangeRequest.name)
    private readonly model: Model<ChangeRequestDocument>,
    private readonly projects: ClientProjectService,
    private readonly notifications: NotificationService,
    private readonly auditLog: AuditLogService,
    private readonly invoices: InvoiceService,
  ) {}

  /**
   * A change request's currency is always the project's budget currency —
   * it's what feeds increaseBudgetAmount() on approval, so a mismatch would
   * silently inflate a budget in the wrong currency. If the caller didn't
   * specify one, it defaults to the project's; if they did, it must match.
   * Reused by quote() (client-initiated requests, priced afterward — see
   * requestFromClient/quote below).
   */
  private async resolveCurrency(
    projectId: string,
    requested?: string,
  ): Promise<string> {
    const projectCurrency = await this.projects.getBudgetCurrency(projectId);
    if (requested && requested !== projectCurrency) {
      throw new BadRequestException(
        `Currency must match the project's budget currency (${projectCurrency})`,
      );
    }
    return requested ?? projectCurrency;
  }

  /** PM (or admin) of the project only — they're the one who prices scope changes. */
  async create(projectId: string, dto: CreateChangeRequestDto, actor: Actor) {
    const subject = await this.projects.findAccessSubject(projectId);
    assertProjectAccess(subject, actor);
    assertProjectManager(subject, actor);

    const currency = await this.resolveCurrency(projectId, dto.currency);

    const changeRequest = await this.model.create({
      ...dto,
      currency,
      project: projectId,
      requestedBy: actor._id,
    });

    const clientIds = await this.projects.getClientUserIds(
      subject.organization.toString(),
    );
    await this.notifications.notifyMany(clientIds, {
      type: 'change_request_quoted',
      title: `New change request: ${changeRequest.title}`,
      body: `${dto.priceAmount} ${currency} — awaiting your approval.`,
      link: portalProjectLink(projectId, 'changes'),
      email: {
        category: 'changeRequests',
        subject: `New change request: ${changeRequest.title}`,
        template: 'change-request-quoted',
        context: {
          title: changeRequest.title,
          amount: dto.priceAmount,
          currency,
          projectName: subject.name,
        },
      },
    });

    return changeRequest;
  }

  /**
   * A client asking for scope themselves, with no price attached — the PM
   * still prices it (see quote() below) before it's approvable; nothing
   * downstream of `quoted` needs to know or care which path got it there.
   *
   * Deliberately stricter than assertCanDecide: exactly Role.USER +
   * CLIENT_ADMIN, not also ADMIN. An admin raising scope on the agency's
   * own initiative already has create() (PM-priced) — this endpoint is
   * specifically "the client is asking", so an admin acting on the
   * client's behalf would blur who actually requested it.
   */
  async requestFromClient(
    projectId: string,
    dto: RequestChangeRequestDto,
    actor: Actor,
  ) {
    const subject = await this.projects.findAccessSubject(projectId);
    assertProjectAccess(subject, actor);
    if (actor.role !== Role.USER || actor.orgRole !== OrgRole.CLIENT_ADMIN) {
      throw new ForbiddenException('Only a client admin can request new scope');
    }

    const currency = await this.resolveCurrency(projectId, undefined);

    const changeRequest = await this.model.create({
      ...dto,
      currency,
      priceAmount: 0,
      status: ChangeRequestStatus.REQUESTED,
      project: projectId,
      requestedBy: actor._id,
    });

    await this.notifications.notify({
      user: subject.projectManager,
      type: 'change_request_requested',
      title: `A client requested new scope: ${changeRequest.title}`,
      body: "Price it from the project's Change requests tab.",
      link: portalProjectLink(projectId, 'changes'),
    });

    return changeRequest;
  }

  /** PM (or admin) prices a client-requested change — requested → quoted. Every rule after `quoted` (approve/reject/mark-invoiced) is unchanged. */
  async quote(id: string, dto: QuoteChangeRequestDto, actor: Actor) {
    const changeRequest = await this.findAccessible(id, actor);
    const subject = await this.projects.findAccessSubject(
      changeRequest.project.toString(),
    );
    assertProjectManager(subject, actor);

    if (changeRequest.status !== ChangeRequestStatus.REQUESTED) {
      throw new BadRequestException(
        'Only a requested (not yet priced) change request can be quoted',
      );
    }

    const currency = await this.resolveCurrency(
      changeRequest.project.toString(),
      dto.currency,
    );

    changeRequest.priceAmount = dto.priceAmount;
    changeRequest.currency = currency;
    changeRequest.status = ChangeRequestStatus.QUOTED;
    await changeRequest.save();

    await this.notifications.notify({
      user: changeRequest.requestedBy,
      type: 'change_request_quoted',
      title: `Your scope request was priced: ${changeRequest.title}`,
      body: `${dto.priceAmount} ${currency} — awaiting your approval.`,
      link: portalProjectLink(changeRequest.project, 'changes'),
      email: {
        category: 'changeRequests',
        subject: `Your scope request was priced: ${changeRequest.title}`,
        template: 'change-request-quoted',
        context: {
          title: changeRequest.title,
          amount: dto.priceAmount,
          currency,
          projectName: subject.name,
        },
      },
    });

    return changeRequest;
  }

  async findForProject(projectId: string, actor: Actor) {
    const subject = await this.projects.findAccessSubject(projectId);
    assertProjectAccess(subject, actor);
    return this.model
      .find({ project: projectId })
      .sort({ createdAt: -1 })
      .populate('requestedBy', 'firstName lastName')
      .populate('approvedBy', 'firstName lastName')
      .lean();
  }

  /**
   * Flat, cross-project list scoped to what `actor` can see — mirrors
   * ApprovalService.findForPortalUser (change requests have no
   * `organization` of their own, so every non-admin role is scoped via
   * their visible project ids). Feeds the portal dashboard's inbox.
   */
  async findForPortalUser(actor: Actor, statuses?: ChangeRequestStatus[]) {
    const query: Record<string, unknown> = {};
    if (statuses?.length) query.status = { $in: statuses };
    if (actor.role !== Role.ADMIN) {
      const myProjects = await this.projects.findForPortalUser(actor);
      query.project = { $in: myProjects.map((p) => p._id) };
    }
    return this.model
      .find(query)
      .sort({ createdAt: -1 })
      .populate('project', 'name')
      .lean();
  }

  /**
   * Cross-project admin view — every change request, regardless of project.
   * Only a client_admin can decide one (see assertCanDecide); this is
   * read-only visibility for the agency into what's awaiting a client.
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
      .populate('approvedBy', 'firstName lastName')
      .lean();
  }

  /** Single change request for the admin detail view (AdminChangeRequestController). */
  async findOneForAdmin(id: string) {
    const changeRequest = await this.model
      .findById(id)
      .populate({
        path: 'project',
        select: 'name organization',
        populate: { path: 'organization', select: 'name' },
      })
      .populate('requestedBy', 'firstName lastName')
      .populate('approvedBy', 'firstName lastName')
      .lean();
    if (!changeRequest) {
      throw new NotFoundException('Change request not found');
    }
    return changeRequest;
  }

  private async findAccessible(
    id: string,
    actor: Actor,
  ): Promise<ChangeRequestDocument> {
    const changeRequest = await this.model.findById(id);
    if (!changeRequest) throw new NotFoundException('Change request not found');
    const subject = await this.projects.findAccessSubject(
      changeRequest.project.toString(),
    );
    assertProjectAccess(subject, actor);
    return changeRequest;
  }

  /** Only a client_admin can commit their organization to extra spend. */
  private assertCanDecide(actor: Actor) {
    if (actor.role === Role.ADMIN) return;
    if (actor.role === Role.USER && actor.orgRole === OrgRole.CLIENT_ADMIN)
      return;
    throw new ForbiddenException(
      'Only a client admin can decide on a change request',
    );
  }

  async approve(id: string, actor: Actor) {
    const changeRequest = await this.findAccessible(id, actor);
    this.assertCanDecide(actor);
    if (changeRequest.status !== ChangeRequestStatus.QUOTED) {
      throw new BadRequestException(
        'Only a quoted change request can be approved',
      );
    }

    const subject = await this.projects.findAccessSubject(
      changeRequest.project.toString(),
    );

    changeRequest.status = ChangeRequestStatus.CLIENT_APPROVED;
    changeRequest.approvedBy = actor._id as any;
    changeRequest.approvedAt = new Date();

    // Auto-raises the invoice for this scope right away, as a draft an
    // admin still reviews and sends — see InvoiceService.createFromChangeRequest.
    // Previously this was a fully manual step (an admin had to notice the
    // approval, hand-create a matching invoice, then click "mark invoiced").
    const invoice = await this.invoices.createFromChangeRequest({
      organizationId: subject.organization.toString(),
      projectId: changeRequest.project.toString(),
      title: `Change request: ${changeRequest.title}`,
      priceAmount: changeRequest.priceAmount,
      currency: changeRequest.currency,
      createdBy: changeRequest.requestedBy.toString(),
    });
    changeRequest.invoiceId = invoice._id as any;

    await changeRequest.save();

    await this.projects.increaseBudgetAmount(
      changeRequest.project.toString(),
      changeRequest.priceAmount,
    );

    await this.notifications.notify({
      user: changeRequest.requestedBy,
      type: 'change_request_approved',
      title: `Change request approved: ${changeRequest.title}`,
      body: 'A draft invoice was created for it — review and send from Invoices.',
      // Not /cpadmin/invoices/:id — requestedBy is the PM who raised it, and
      // a manager gets redirected out of /cpadmin entirely (admin-only).
      // The project's own Invoices tab shows drafts too, so it's reachable
      // by whichever role they actually have.
      link: portalProjectLink(changeRequest.project, 'invoices'),
    });

    await this.auditLog.record({
      actor: actor._id!.toString(),
      action: 'change_request.approved',
      entityType: 'ChangeRequest',
      entityId: id,
      meta: {
        priceAmount: changeRequest.priceAmount,
        currency: changeRequest.currency,
        invoiceId: invoice._id!.toString(),
      },
    });

    return changeRequest;
  }

  async reject(id: string, dto: RejectChangeRequestDto, actor: Actor) {
    const changeRequest = await this.findAccessible(id, actor);
    this.assertCanDecide(actor);
    if (changeRequest.status !== ChangeRequestStatus.QUOTED) {
      throw new BadRequestException(
        'Only a quoted change request can be rejected',
      );
    }

    changeRequest.status = ChangeRequestStatus.REJECTED;
    changeRequest.rejectionReason = dto.reason;
    await changeRequest.save();

    await this.notifications.notify({
      user: changeRequest.requestedBy,
      type: 'change_request_rejected',
      title: `Change request rejected: ${changeRequest.title}`,
      body: dto.reason,
      link: portalProjectLink(changeRequest.project, 'changes'),
    });

    await this.auditLog.record({
      actor: actor._id!.toString(),
      action: 'change_request.rejected',
      entityType: 'ChangeRequest',
      entityId: id,
    });

    return changeRequest;
  }

  /** Manual marker once an admin has raised the corresponding invoice — v1 doesn't auto-link the two records. Staff-only (assertProjectManager covers admin too). */
  async markInvoiced(id: string, actor: Actor) {
    const changeRequest = await this.findAccessible(id, actor);
    const subject = await this.projects.findAccessSubject(
      changeRequest.project.toString(),
    );
    assertProjectManager(subject, actor);

    if (changeRequest.status !== ChangeRequestStatus.CLIENT_APPROVED) {
      throw new BadRequestException(
        'Only an approved change request can be marked invoiced',
      );
    }

    changeRequest.status = ChangeRequestStatus.INVOICED;
    await changeRequest.save();
    return changeRequest;
  }
}
