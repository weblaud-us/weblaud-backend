import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Comment,
  CommentDocument,
  CommentSubjectType,
} from './schemas/comment.schema';
import { CreateCommentDto } from './dto/create-comment.dto';
import { Task, TaskDocument } from 'src/modules/task/schemas/task.schema';
import {
  FileVisibility,
  ProjectFile,
  ProjectFileDocument,
} from 'src/modules/file/schemas/project-file.schema';
import { ClientProjectService } from 'src/modules/client-project/client-project.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import { UsersService } from 'src/modules/users/users.service';
import {
  assertProjectAccess,
  hasProjectAccess,
  ProjectAccessActor,
} from 'src/common/utils/project-access.util';
import { Role } from 'src/common/enum/user.role.enum';

const AUTHOR_PICK = 'firstName lastName avatar title role';

interface Subject {
  projectId: string;
  /** Only staff may read/write this subject at all (task board is a staff tool — see task.service.ts's own doc comment). */
  staffOnly: boolean;
  /** A client may read/write only if this subject is itself client-visible (a FILE with visibility=client); irrelevant when staffOnly. */
  clientVisible: boolean;
}

@Injectable()
export class CommentService {
  constructor(
    @InjectModel(Comment.name) private readonly model: Model<CommentDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    @InjectModel(ProjectFile.name)
    private readonly fileModel: Model<ProjectFileDocument>,
    private readonly projects: ClientProjectService,
    private readonly notifications: NotificationService,
    private readonly users: UsersService,
  ) {}

  private async resolveTaskSubject(taskId: string): Promise<Subject> {
    const task = await this.taskModel.findById(taskId).select('project');
    if (!task) throw new NotFoundException('Task not found');
    return {
      projectId: task.project.toString(),
      staffOnly: true,
      clientVisible: false,
    };
  }

  private async resolveFileSubject(fileId: string): Promise<Subject> {
    const file = await this.fileModel
      .findById(fileId)
      .select('project visibility');
    if (!file) throw new NotFoundException('File not found');
    return {
      projectId: file.project.toString(),
      staffOnly: false,
      clientVisible: file.visibility === FileVisibility.CLIENT,
    };
  }

  private async assertSubjectAccess(
    subject: Subject,
    actor: ProjectAccessActor & { role: Role },
  ) {
    const projectSubject = await this.projects.findAccessSubject(
      subject.projectId,
    );
    assertProjectAccess(projectSubject, actor);

    if (subject.staffOnly && actor.role === Role.USER) {
      throw new ForbiddenException('Only staff can comment here');
    }
    if (
      actor.role === Role.USER &&
      !subject.staffOnly &&
      !subject.clientVisible
    ) {
      throw new ForbiddenException('You do not have access to this thread');
    }
  }

  /**
   * The subset of `userIds` who would be allowed to read a comment on this
   * subject — the same rules list() and assertSubjectAccess apply to a reader:
   * project access, and for a client additionally a non-internal comment on a
   * client-visible, non-staff-only subject. Unknown ids are simply dropped.
   */
  private async filterReaders(
    userIds: string[],
    subject: Subject,
    internal: boolean,
  ): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();

    const projectSubject = await this.projects.findAccessSubject(
      subject.projectId,
    );
    const users = await this.users.findAccessActors(userIds);

    const readers = users.filter((user) => {
      if (!hasProjectAccess(projectSubject, user)) return false;
      if (user.role !== Role.USER) return true;
      return !internal && !subject.staffOnly && subject.clientVisible;
    });
    return new Set(readers.map((user) => user._id.toString()));
  }

  private async list(
    subjectType: CommentSubjectType,
    subjectId: string | undefined,
    subject: Subject,
    actor: ProjectAccessActor & { role: Role },
  ) {
    await this.assertSubjectAccess(subject, actor);

    const query: Record<string, unknown> = {
      project: subject.projectId,
      subjectType,
      subjectId,
    };
    // Internal comments are a staff-only side note even on a thread a
    // client can otherwise read — see the schema comment on Comment.internal.
    if (actor.role === Role.USER) query.internal = false;

    return this.model
      .find(query)
      .sort({ createdAt: 1 })
      .populate('author', AUTHOR_PICK)
      .populate('mentions', 'firstName lastName')
      .lean();
  }

  async findForProject(
    projectId: string,
    actor: ProjectAccessActor & { role: Role },
  ) {
    return this.list(
      CommentSubjectType.PROJECT,
      undefined,
      {
        projectId,
        staffOnly: false,
        clientVisible: true,
      },
      actor,
    );
  }

  async findForTask(
    taskId: string,
    actor: ProjectAccessActor & { role: Role },
  ) {
    const subject = await this.resolveTaskSubject(taskId);
    return this.list(CommentSubjectType.TASK, taskId, subject, actor);
  }

  async findForFile(
    fileId: string,
    actor: ProjectAccessActor & { role: Role },
  ) {
    const subject = await this.resolveFileSubject(fileId);
    return this.list(CommentSubjectType.FILE, fileId, subject, actor);
  }

  private async create(
    subjectType: CommentSubjectType,
    subjectId: string | undefined,
    subject: Subject,
    dto: CreateCommentDto,
    actor: ProjectAccessActor & { role: Role },
  ) {
    await this.assertSubjectAccess(subject, actor);

    // A client can't create an internal (staff-only) note — that would be a
    // client hiding something from themselves, which isn't a real use case,
    // so it's forced off rather than validated/rejected.
    const internal = actor.role === Role.USER ? false : (dto.internal ?? false);

    let parentAuthor: string | undefined;
    if (dto.parent) {
      const parent = await this.model
        .findById(dto.parent)
        .select('author project subjectType subjectId');
      if (
        !parent ||
        parent.project.toString() !== subject.projectId ||
        parent.subjectType !== subjectType ||
        (parent.subjectId?.toString() ?? undefined) !== subjectId
      ) {
        throw new NotFoundException('Parent comment not found in this thread');
      }
      parentAuthor = parent.author.toString();
    }

    // Everyone this comment may notify must be able to read it. Mentions used
    // to be any user id at all (so anyone who could comment could make the
    // platform email anybody), and a staff member's *internal* reply to a
    // client's comment notified that client — with the note's text in the
    // notification body. Filtered once here so the stored mentions and the
    // notification fan-out agree.
    const readers = await this.filterReaders(
      [...new Set([...(dto.mentions ?? []), ...(parentAuthor ? [parentAuthor] : [])])],
      subject,
      internal,
    );
    const mentions = (dto.mentions ?? []).filter((id) => readers.has(id));
    const notifiableParentAuthor =
      parentAuthor && readers.has(parentAuthor) ? parentAuthor : undefined;

    const comment = await this.model.create({
      project: subject.projectId,
      subjectType,
      subjectId,
      author: actor._id,
      body: dto.body,
      mentions,
      internal,
      parent: dto.parent,
    });

    await this.notifyParticipants(
      comment,
      subject,
      notifiableParentAuthor,
      actor,
    );

    return this.model
      .findById(comment._id)
      .populate('author', AUTHOR_PICK)
      .populate('mentions', 'firstName lastName')
      .lean();
  }

  async createForProject(
    projectId: string,
    dto: CreateCommentDto,
    actor: ProjectAccessActor & { role: Role },
  ) {
    return this.create(
      CommentSubjectType.PROJECT,
      undefined,
      { projectId, staffOnly: false, clientVisible: true },
      dto,
      actor,
    );
  }

  async createForTask(
    taskId: string,
    dto: CreateCommentDto,
    actor: ProjectAccessActor & { role: Role },
  ) {
    const subject = await this.resolveTaskSubject(taskId);
    return this.create(CommentSubjectType.TASK, taskId, subject, dto, actor);
  }

  async createForFile(
    fileId: string,
    dto: CreateCommentDto,
    actor: ProjectAccessActor & { role: Role },
  ) {
    const subject = await this.resolveFileSubject(fileId);
    return this.create(CommentSubjectType.FILE, fileId, subject, dto, actor);
  }

  async remove(id: string, actor: ProjectAccessActor & { role: Role }) {
    const comment = await this.model.findById(id);
    if (!comment) throw new NotFoundException('Comment not found');

    const subject = await this.projects.findAccessSubject(
      comment.project.toString(),
    );
    assertProjectAccess(subject, actor);

    const isAuthor = comment.author.toString() === actor._id?.toString();
    const isPmOrAdmin =
      actor.role === Role.ADMIN ||
      subject.projectManager?.toString() === actor._id?.toString();
    if (!isAuthor && !isPmOrAdmin) {
      throw new ForbiddenException(
        'Only the author or the project manager can delete this comment',
      );
    }

    await comment.deleteOne();
    return { deleted: true };
  }

  /**
   * @mentions always notify, regardless of email opt-in (in-app row is
   * unconditional, same as every other NotificationService call) — the
   * email half respects the `mentions` category preference. A reply also
   * notifies the parent comment's author (if different from the poster and
   * not already mentioned, to avoid double-notifying them) so a thread
   * feels like a conversation, not just a wall people have to poll.
   */
  private async notifyParticipants(
    comment: CommentDocument,
    subject: Subject,
    parentAuthor: string | undefined,
    actor: ProjectAccessActor & {
      role: Role;
      firstName?: string;
      lastName?: string;
    },
  ) {
    const link = this.threadLink(comment);
    // req.user is the full User document (see JwtAccessStrategy.validate),
    // not just the JWT payload — firstName/lastName are already on hand, no
    // extra lookup needed for the email's "X mentioned you" line.
    const authorName = actor.firstName
      ? `${actor.firstName} ${actor.lastName ?? ''}`.trim()
      : 'Someone';

    const recipients = new Set(comment.mentions.map((m) => m.toString()));
    if (parentAuthor && parentAuthor !== actor._id?.toString())
      recipients.add(parentAuthor);
    recipients.delete(actor._id?.toString() ?? '');

    for (const userId of recipients) {
      const isMention = comment.mentions.some((m) => m.toString() === userId);
      await this.notifications.notify({
        user: userId,
        type: isMention ? 'comment_mention' : 'comment_reply',
        title: isMention
          ? 'You were mentioned in a comment'
          : 'New reply on a thread you posted in',
        body: comment.body.slice(0, 140),
        link,
        ...(isMention
          ? {
              email: {
                category: 'mentions' as const,
                subject: `${authorName} mentioned you`,
                template: 'comment-mention',
                context: { authorName, excerpt: comment.body.slice(0, 280) },
              },
            }
          : {}),
      });
    }
  }

  private threadLink(comment: CommentDocument): string {
    if (comment.subjectType === CommentSubjectType.TASK) {
      return `/portal/projects/${comment.project}/tasks`;
    }
    if (comment.subjectType === CommentSubjectType.FILE) {
      return `/portal/projects/${comment.project}/files`;
    }
    return `/portal/projects/${comment.project}/discussion`;
  }
}
