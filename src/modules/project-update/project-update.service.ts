import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ProjectUpdate,
  ProjectUpdateDocument,
  ProjectUpdateStatus,
} from './schemas/project-update.schema';
import { CreateProjectUpdateDto } from './dto/create-project-update.dto';
import { EditProjectUpdateDto } from './dto/edit-project-update.dto';
import { RejectProjectUpdateDto } from './dto/reject-project-update.dto';
import { ClientProjectService } from 'src/modules/client-project/client-project.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import { AuditLogService } from 'src/modules/audit-log/audit-log.service';
import {
  assertProjectAccess,
  isProjectManager,
  ProjectAccessActor,
  projectAuthorRole,
} from 'src/common/utils/project-access.util';
import { Role } from 'src/common/enum/user.role.enum';

const AUTHOR_PICK = 'firstName lastName avatar title role';

@Injectable()
export class ProjectUpdateService {
  constructor(
    @InjectModel(ProjectUpdate.name)
    private readonly model: Model<ProjectUpdateDocument>,
    private readonly clientProjects: ClientProjectService,
    private readonly notifications: NotificationService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * A PM (or admin) posting publishes immediately and moves project.progress
   * right away. A developer's post starts PENDING_REVIEW — nothing about it
   * (including any progressValue) touches the project or the client's view
   * until a PM approves it. This is the one rule the whole Developer → PM →
   * Client flow rests on.
   */
  async create(
    projectId: string,
    dto: CreateProjectUpdateDto,
    actor: ProjectAccessActor,
  ) {
    const subject = await this.clientProjects.findAccessSubject(projectId);
    assertProjectAccess(subject, actor);

    // A client is a project "member" for access purposes but has no
    // authoring role here — only staff (PM/developer) post updates.
    if (actor.role === Role.USER) {
      throw new ForbiddenException('Clients cannot post project updates');
    }

    const authorRole = projectAuthorRole(subject, actor);
    const publishNow = authorRole === 'pm';

    const update = await this.model.create({
      project: projectId,
      author: actor._id,
      authorRole,
      title: dto.title,
      body: dto.body,
      type: dto.type,
      progressValue: dto.progressValue,
      status: publishNow
        ? ProjectUpdateStatus.PUBLISHED
        : ProjectUpdateStatus.PENDING_REVIEW,
      publishedAt: publishNow ? new Date() : undefined,
    });

    if (publishNow) {
      if (dto.progressValue !== undefined) {
        await this.clientProjects.applyProgress(projectId, dto.progressValue);
      }
      const clientIds = await this.clientProjects.getClientUserIds(
        subject.organization.toString(),
      );
      await this.notifications.notifyMany(clientIds, {
        type: 'project_update',
        title: `New update on your project`,
        body: dto.title,
        link: `/portal/projects/${projectId}`,
        email: {
          category: 'updates',
          subject: `New update on ${subject.name}`,
          template: 'project-update-published',
          context: { projectName: subject.name, updateTitle: dto.title },
        },
      });
    } else {
      await this.notifications.notify({
        user: subject.projectManager,
        type: 'update_pending_review',
        title: `An update is waiting for your review`,
        body: dto.title,
        link: `/portal/projects/${projectId}`,
      });
    }

    return update;
  }

  /**
   * Clients only ever see published updates — a pending or rejected one is
   * internal, staff-side conversation about work in progress, not something
   * to show the person paying for it. Staff (PM, developer, admin) see
   * everything so a dev can track their own pending/rejected posts and a PM
   * can see the full history while reviewing.
   */
  async findForProject(projectId: string, actor: ProjectAccessActor) {
    const subject = await this.clientProjects.findAccessSubject(projectId);
    assertProjectAccess(subject, actor);

    const query: Record<string, unknown> = { project: projectId };
    if (actor.role === Role.USER) {
      query.status = ProjectUpdateStatus.PUBLISHED;
    }

    return this.model
      .find(query)
      .sort({ createdAt: -1 })
      .populate('author', AUTHOR_PICK)
      .populate('reviewedBy', AUTHOR_PICK)
      .lean();
  }

  /** Author-only, and only while still editable (pre-publish). Resubmitting a rejected update sends it back to review. */
  async editOwn(
    updateId: string,
    dto: EditProjectUpdateDto,
    actor: ProjectAccessActor,
  ) {
    const update = await this.model.findById(updateId);
    if (!update) throw new NotFoundException('Update not found');

    if (update.author.toString() !== actor._id!.toString()) {
      throw new ForbiddenException('You can only edit your own updates');
    }
    if (update.status === ProjectUpdateStatus.PUBLISHED) {
      throw new BadRequestException(
        'A published update can no longer be edited',
      );
    }

    const wasRejected = update.status === ProjectUpdateStatus.REJECTED;

    Object.assign(update, dto);
    if (wasRejected) {
      update.status = ProjectUpdateStatus.PENDING_REVIEW;
      update.reviewNote = undefined;
      update.reviewedBy = undefined;
      update.reviewedAt = undefined;

      const subject = await this.clientProjects.findAccessSubject(
        update.project.toString(),
      );
      await this.notifications.notify({
        user: subject.projectManager,
        type: 'update_pending_review',
        title: `An update was resubmitted for your review`,
        body: update.title,
        link: `/portal/projects/${update.project}`,
      });
    }

    await update.save();
    return update;
  }

  /** PM (or admin) only. Publishes, applies progressValue, and notifies both the client org and the developer whose work it was. */
  async approve(updateId: string, actor: ProjectAccessActor) {
    const update = await this.model.findById(updateId);
    if (!update) throw new NotFoundException('Update not found');
    if (update.status !== ProjectUpdateStatus.PENDING_REVIEW) {
      throw new BadRequestException('Only a pending update can be approved');
    }

    const subject = await this.clientProjects.findAccessSubject(
      update.project.toString(),
    );
    assertProjectAccess(subject, actor);
    if (!isProjectManager(subject, actor)) {
      throw new ForbiddenException(
        'Only the project manager can approve updates',
      );
    }

    update.status = ProjectUpdateStatus.PUBLISHED;
    update.publishedAt = new Date();
    update.reviewedBy = actor._id as any;
    update.reviewedAt = new Date();
    await update.save();

    if (update.progressValue !== undefined) {
      await this.clientProjects.applyProgress(
        update.project.toString(),
        update.progressValue,
      );
    }

    const clientIds = await this.clientProjects.getClientUserIds(
      subject.organization.toString(),
    );
    await this.notifications.notifyMany(clientIds, {
      type: 'project_update',
      title: `New update on your project`,
      body: update.title,
      link: `/portal/projects/${update.project}`,
      email: {
        category: 'updates',
        subject: `New update on ${subject.name}`,
        template: 'project-update-published',
        context: { projectName: subject.name, updateTitle: update.title },
      },
    });
    await this.notifications.notify({
      user: update.author,
      type: 'update_approved',
      title: `Your update was approved`,
      body: update.title,
      link: `/portal/projects/${update.project}`,
    });

    await this.auditLog.record({
      actor: actor._id!.toString(),
      action: 'project_update.approve',
      entityType: 'ProjectUpdate',
      entityId: updateId,
    });

    return update;
  }

  /** PM (or admin) only. Sends the update back to the developer with a reason instead of publishing it. */
  async reject(
    updateId: string,
    dto: RejectProjectUpdateDto,
    actor: ProjectAccessActor,
  ) {
    const update = await this.model.findById(updateId);
    if (!update) throw new NotFoundException('Update not found');
    if (update.status !== ProjectUpdateStatus.PENDING_REVIEW) {
      throw new BadRequestException('Only a pending update can be rejected');
    }

    const subject = await this.clientProjects.findAccessSubject(
      update.project.toString(),
    );
    assertProjectAccess(subject, actor);
    if (!isProjectManager(subject, actor)) {
      throw new ForbiddenException(
        'Only the project manager can reject updates',
      );
    }

    update.status = ProjectUpdateStatus.REJECTED;
    update.reviewNote = dto.reviewNote;
    update.reviewedBy = actor._id as any;
    update.reviewedAt = new Date();
    await update.save();

    await this.notifications.notify({
      user: update.author,
      type: 'update_rejected',
      title: `Your update needs changes`,
      body: dto.reviewNote,
      link: `/portal/projects/${update.project}`,
    });

    await this.auditLog.record({
      actor: actor._id!.toString(),
      action: 'project_update.reject',
      entityType: 'ProjectUpdate',
      entityId: updateId,
      meta: { reviewNote: dto.reviewNote },
    });

    return update;
  }

  /** Pending updates across every project this user is PM on (admin: everywhere) — drives the portal's "Review queue" badge. */
  async reviewQueue(actor: ProjectAccessActor) {
    const projectIds =
      actor.role === Role.ADMIN
        ? undefined
        : await this.clientProjects.findProjectIdsManagedBy(
            actor._id!.toString(),
          );

    if (projectIds && projectIds.length === 0) return [];

    const query: Record<string, unknown> = {
      status: ProjectUpdateStatus.PENDING_REVIEW,
    };
    if (projectIds) query.project = { $in: projectIds };

    return this.model
      .find(query)
      .sort({ createdAt: -1 })
      .populate('author', AUTHOR_PICK)
      .populate('project', 'name')
      .lean();
  }
}
