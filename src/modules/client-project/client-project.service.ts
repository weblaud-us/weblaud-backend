import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ClientProject,
  ClientProjectDocument,
} from './schemas/client-project.schema';
import { CreateClientProjectDto } from './dto/create-client-project.dto';
import { UpdateClientProjectDto } from './dto/update-client-project.dto';
import { PortalUpdateProjectDto } from './dto/portal-update-project.dto';
import {
  assertProjectAccess,
  assertProjectManager,
  ProjectAccessActor,
} from 'src/common/utils/project-access.util';
import { Role } from 'src/common/enum/user.role.enum';
import { UsersService } from 'src/modules/users/users.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import { AuditLogService } from 'src/modules/audit-log/audit-log.service';

const STAFF_PICK = 'firstName lastName email avatar title role';

@Injectable()
export class ClientProjectService {
  constructor(
    @InjectModel(ClientProject.name)
    private readonly model: Model<ClientProjectDocument>,
    private readonly users: UsersService,
    private readonly notifications: NotificationService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ================================
  //     AGENCY SIDE (admin/manager CRUD)
  // ================================

  async create(dto: CreateClientProjectDto, userId: string) {
    const project = await this.model.create({ ...dto, createdBy: userId });

    await this.notifications.notify({
      user: project.projectManager,
      type: 'project_assigned',
      title: `You're the PM on ${project.name}`,
      body: 'Assign your team and start posting updates.',
      link: `/portal/projects/${project._id}`,
    });

    await this.auditLog.record({
      actor: userId,
      action: 'project.create',
      entityType: 'ClientProject',
      entityId: String(project._id),
    });

    return project;
  }

  async findAll() {
    return this.model
      .find()
      .sort({ createdAt: -1 })
      .populate('organization', 'name logo')
      .populate('projectManager', STAFF_PICK)
      .lean();
  }

  async findOne(id: string) {
    const project = await this.model
      .findById(id)
      .populate('organization')
      .populate('projectManager', STAFF_PICK)
      .populate('team', STAFF_PICK);
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async update(id: string, dto: UpdateClientProjectDto, actorId: string) {
    const before = await this.model.findById(id).select('projectManager team');
    if (!before) throw new NotFoundException('Project not found');

    // dto.budget only ever carries {amount, currency} (see BudgetInput) —
    // never `spent`, which is a denormalized running total this method has
    // no business touching. Writing it as a nested object lets Mongoose
    // replace the whole budget subdocument, silently resetting `spent` to
    // undefined/0 on every edit that happens to also touch budget (which is
    // every edit through the admin form, since it always submits both
    // fields together). Flattened into dot-paths, the write only ever
    // touches the two fields actually being edited.
    const update: Record<string, unknown> = { ...dto };
    if (dto.budget) {
      delete update.budget;
      if (dto.budget.amount !== undefined)
        update['budget.amount'] = dto.budget.amount;
      if (dto.budget.currency !== undefined)
        update['budget.currency'] = dto.budget.currency;
    }

    const updated = await this.model.findByIdAndUpdate(id, update, {
      new: true,
    });
    if (!updated) throw new NotFoundException('Project not found');

    // Only notify people who are newly on the hook, not everyone in the new
    // list — re-saving an unchanged team every time this is edited would
    // otherwise re-notify the whole team on every unrelated field tweak.
    if (
      dto.projectManager &&
      dto.projectManager !== before.projectManager.toString()
    ) {
      await this.notifications.notify({
        user: dto.projectManager,
        type: 'project_assigned',
        title: `You're the PM on ${updated.name}`,
        body: 'Assign your team and start posting updates.',
        link: `/portal/projects/${updated._id}`,
      });
    }

    if (dto.team) {
      const existingTeam = new Set(before.team.map((t) => t.toString()));
      const addedTeam = dto.team.filter((id) => !existingTeam.has(id));
      await this.notifications.notifyMany(addedTeam, {
        type: 'project_assigned',
        title: `You've been added to ${updated.name}`,
        body: 'You can now post progress updates for this project.',
        link: `/portal/projects/${updated._id}`,
      });
    }

    await this.auditLog.record({
      actor: actorId,
      action: 'project.update',
      entityType: 'ClientProject',
      entityId: id,
      meta: { fields: Object.keys(dto) },
    });

    return updated;
  }

  async delete(id: string, actorId: string) {
    const deleted = await this.model.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('Project not found');

    await this.auditLog.record({
      actor: actorId,
      action: 'project.delete',
      entityType: 'ClientProject',
      entityId: id,
      meta: { name: deleted.name },
    });

    return { deleted: true };
  }

  // ================================
  //     PORTAL SIDE (membership-scoped)
  // ================================

  /**
   * PM-only edit surface (admin also passes, per assertProjectManager) for
   * status/progress/features/timeline/team — see PortalUpdateProjectDto for
   * why org/PM/budget are absent. Reuses the same access-subject-then-
   * populate split as findOneForPortalUser, and the same newly-added-team
   * notification logic as the admin-side update() above.
   */
  async updateForPortalUser(
    id: string,
    dto: PortalUpdateProjectDto,
    actor: ProjectAccessActor,
  ) {
    const subject = await this.findAccessSubject(id);
    assertProjectAccess(subject, actor);
    assertProjectManager(subject, actor);

    if (dto.team) {
      const existingTeam = new Set(subject.team.map((t) => t.toString()));
      const addedTeam = dto.team.filter(
        (memberId) => !existingTeam.has(memberId),
      );
      await this.notifications.notifyMany(addedTeam, {
        type: 'project_assigned',
        title: `You've been added to a project`,
        body: 'You can now post progress updates for it.',
        link: `/portal/projects/${id}`,
      });
    }

    const updated = await this.model.findByIdAndUpdate(id, dto, { new: true });
    if (!updated) throw new NotFoundException('Project not found');

    await this.auditLog.record({
      actor: actor._id!.toString(),
      action: 'project.update',
      entityType: 'ClientProject',
      entityId: id,
      meta: { fields: Object.keys(dto) },
    });

    return this.model
      .findById(id)
      .populate('organization')
      .populate('projectManager', STAFF_PICK)
      .populate('team', STAFF_PICK);
  }

  /** Active client user ids for an organization — notification fan-out for project events (see project-update/update-request services). */
  async getClientUserIds(organizationId: string): Promise<string[]> {
    const clients = await this.users.findByOrganization(organizationId);
    return clients.map((c) => c._id.toString());
  }

  /** Used by ChangeRequestService to keep a change request's currency pinned to its project's budget currency — see ChangeRequestService.resolveCurrency. */
  async getBudgetCurrency(id: string): Promise<string> {
    const project = await this.model.findById(id).select('budget.currency');
    if (!project) throw new NotFoundException('Project not found');
    return project.budget.currency;
  }

  /** Project ids this user is PM on — drives ProjectUpdateService's review-queue. */
  async findProjectIdsManagedBy(userId: string): Promise<string[]> {
    const projects = await this.model
      .find({ projectManager: userId })
      .select('_id')
      .lean();
    return projects.map((p) => p._id.toString());
  }

  /**
   * The task board's recomputed progress — TaskService.recomputeProgress is
   * the only caller, and the only writer of project.progress. A bare field
   * write, not routed through update()/updateForPortalUser(), since it's an
   * internal side effect of a task change rather than a user-initiated
   * project edit (no notification/audit entry of its own).
   */
  async applyProgress(id: string, progress: number): Promise<void> {
    await this.model.updateOne({ _id: id }, { progress });
  }

  /**
   * Approving a change order isn't just a status flip — the whole point is
   * that new scope shows up in the number everyone (client, PM, owner
   * dashboard later) actually looks at. See ChangeRequestService.approve.
   */
  async increaseBudgetAmount(id: string, amount: number): Promise<void> {
    await this.model.updateOne(
      { _id: id },
      { $inc: { 'budget.amount': amount } },
    );
  }

  /**
   * `budget.spent` is the denormalized "sum of paid invoices" the schema
   * comment on ProjectBudget promised — kept here rather than aggregated on
   * every read so the overview page is a single document fetch. Called from
   * InvoiceService each time a payment settles (in full or in part), never
   * from a user-facing action directly.
   */
  async increaseBudgetSpent(id: string, amount: number): Promise<void> {
    await this.adjustBudgetSpent(id, amount);
  }

  /**
   * General form of increaseBudgetSpent — `delta` may be negative. Nothing
   * calls this with a negative delta yet (there is no refund/credit-note
   * flow in the product yet: InvoiceService.void() refuses to void a paid
   * invoice, so budget.spent can currently only grow), but the figure is a
   * denormalized running total with no other write path, so a future refund
   * needs exactly this primitive to correct it rather than direct database
   * surgery. See the audit's finding on budget.spent for the reconciliation
   * script this pairs with.
   */
  async adjustBudgetSpent(id: string, delta: number): Promise<void> {
    await this.model.updateOne(
      { _id: id },
      { $inc: { 'budget.spent': delta } },
    );
  }

  /**
   * Lists only the projects `user` can see: clients get every project under
   * their organization, staff get only what they're assigned to as PM or
   * team, admins get everything. Filtering happens in the query (not by
   * fetching all and running assertProjectAccess per row) so this scales
   * with the org's/staff's own project count, not the whole collection.
   */
  async findForPortalUser(user: ProjectAccessActor) {
    const query =
      user.role === Role.ADMIN
        ? {}
        : user.role === Role.USER
          ? { organization: user.organization }
          : { $or: [{ projectManager: user._id }, { team: user._id }] };

    return this.model
      .find(query)
      .sort({ createdAt: -1 })
      .populate('organization', 'name logo')
      .populate('projectManager', STAFF_PICK)
      .lean();
  }

  async findOneForPortalUser(id: string, user: ProjectAccessActor) {
    // Access is checked against the raw (unpopulated) subject first, and
    // only then do we fetch the populated version for the response.
    // assertProjectAccess()'s idsMatch does `.toString()` on each side —
    // running it against an already-populated `organization`/`projectManager`
    // would compare a full Mongoose document's default Object.prototype
    // toString() ("[object Object]") against a real id string, which never
    // matches. That's a silent, wrong-answer bug (a legitimate client
    // getting a false 403), not a crash, so the check has to happen before
    // populate ever runs.
    const subject = await this.findAccessSubject(id);
    assertProjectAccess(subject, user);

    const project = await this.model
      .findById(id)
      .populate('organization')
      .populate('projectManager', STAFF_PICK)
      .populate('team', STAFF_PICK);

    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  /**
   * Internal helper for sibling modules (updates, files, tasks, messages,
   * approvals, change-requests, invoices, contracts) that need to check
   * access to a project without pulling in the populate/lean overhead of the
   * portal read endpoints above.
   */
  async findAccessSubject(id: string) {
    const project = await this.model
      .findById(id)
      // `name` is included purely for callers building notification/email
      // copy (e.g. "New update on {{projectName}}") — it's not used by any
      // access check itself, just cheap enough to not warrant a second query.
      .select('name organization projectManager team');
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }
}
