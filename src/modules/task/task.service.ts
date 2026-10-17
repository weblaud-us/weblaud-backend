import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument, TaskStatus } from './schemas/task.schema';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ReorderTasksDto } from './dto/reorder-tasks.dto';
import { ClientProjectService } from 'src/modules/client-project/client-project.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import {
  assertProjectAccess,
  ProjectAccessActor,
} from 'src/common/utils/project-access.util';
import { Role } from 'src/common/enum/user.role.enum';

const ASSIGNEE_PICK = 'firstName lastName avatar title role';

@Injectable()
export class TaskService {
  constructor(
    @InjectModel(Task.name) private readonly model: Model<TaskDocument>,
    private readonly projects: ClientProjectService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * A client is a project "member" for read purposes but the task board is a
   * staff coordination tool, not a client-facing form — collaborative among
   * the whole team, not gated to the PM the way approvals/change-requests
   * (formal, money-adjacent decisions) are. See assertProjectAccess's own
   * per-role rules for the membership half of this check.
   */
  private async assertStaffOnProject(
    projectId: string,
    actor: ProjectAccessActor,
  ) {
    const subject = await this.projects.findAccessSubject(projectId);
    assertProjectAccess(subject, actor);
    if (actor.role === Role.USER) {
      throw new ForbiddenException('Only staff can manage the task board');
    }
    return subject;
  }

  async create(
    projectId: string,
    dto: CreateTaskDto,
    actor: ProjectAccessActor & { role: Role },
  ) {
    await this.assertStaffOnProject(projectId, actor);

    const status = dto.status ?? TaskStatus.BACKLOG;
    const order = await this.nextOrder(projectId, status);

    const task = await this.model.create({
      project: projectId,
      feature: dto.feature,
      title: dto.title,
      description: dto.description,
      status,
      assignee: dto.assignee,
      dueDate: dto.dueDate,
      estimateHours: dto.estimateHours,
      clientVisible: dto.clientVisible,
      order,
      createdBy: actor._id,
    });

    if (dto.assignee) {
      await this.notifications.notify({
        user: dto.assignee,
        type: 'task_assigned',
        title: `You were assigned: ${task.title}`,
        link: `/portal/projects/${projectId}/tasks`,
      });
    }

    await this.recomputeProgress(projectId);
    return this.findOne((task._id as Types.ObjectId).toString());
  }

  async findForProject(projectId: string, actor: ProjectAccessActor) {
    const subject = await this.projects.findAccessSubject(projectId);
    assertProjectAccess(subject, actor);

    const query: Record<string, unknown> = { project: projectId };
    // Clients only ever see the filtered, read-only board — see the schema
    // comment on Task.clientVisible.
    if (actor.role === Role.USER) query.clientVisible = true;

    return this.model
      .find(query)
      .sort({ status: 1, order: 1 })
      .populate('assignee', ASSIGNEE_PICK)
      .populate('feature', 'title')
      .lean();
  }

  private async findOne(id: string) {
    const task = await this.model
      .findById(id)
      .populate('assignee', ASSIGNEE_PICK)
      .populate('feature', 'title');
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private async findAccessible(id: string, actor: ProjectAccessActor) {
    const task = await this.model.findById(id);
    if (!task) throw new NotFoundException('Task not found');
    await this.assertStaffOnProject(task.project.toString(), actor);
    return task;
  }

  async update(
    id: string,
    dto: UpdateTaskDto,
    actor: ProjectAccessActor & { role: Role },
  ) {
    const task = await this.findAccessible(id, actor);
    const previousAssignee = task.assignee?.toString();

    Object.assign(task, dto);
    await task.save();

    if (dto.assignee && dto.assignee !== previousAssignee) {
      await this.notifications.notify({
        user: dto.assignee,
        type: 'task_assigned',
        title: `You were assigned: ${task.title}`,
        link: `/portal/projects/${task.project}/tasks`,
      });
    }

    await this.recomputeProgress(task.project.toString());
    return this.findOne(id);
  }

  async remove(id: string, actor: ProjectAccessActor & { role: Role }) {
    const task = await this.findAccessible(id, actor);
    const projectId = task.project.toString();
    await task.deleteOne();
    await this.recomputeProgress(projectId);
    return { deleted: true };
  }

  /**
   * One bulk write covering everything a single drag-and-drop move touched
   * — see the doc comment on ReorderTasksDto for why the frontend computes
   * the full resulting position list instead of the backend inferring it
   * from a single (id, index) pair. Every task referenced must belong to
   * the same project and that project must pass the same staff check as
   * every other write here — validated up front so a partially-authorized
   * batch can't apply some positions and reject others.
   */
  async reorder(
    dto: ReorderTasksDto,
    actor: ProjectAccessActor & { role: Role },
  ) {
    if (dto.positions.length === 0) return { updated: 0 };

    const tasks = await this.model
      .find({ _id: { $in: dto.positions.map((p) => p.id) } })
      .select('project');
    if (tasks.length !== dto.positions.length) {
      throw new NotFoundException('One or more tasks not found');
    }

    const projectIds = new Set(tasks.map((t) => t.project.toString()));
    if (projectIds.size !== 1) {
      throw new ForbiddenException(
        'All tasks in a reorder must belong to the same project',
      );
    }
    const [projectId] = projectIds;
    await this.assertStaffOnProject(projectId, actor);

    await Promise.all(
      dto.positions.map((p) =>
        this.model.updateOne(
          { _id: p.id },
          { status: p.status, order: p.order },
        ),
      ),
    );

    await this.recomputeProgress(projectId);
    return { updated: dto.positions.length };
  }

  private async nextOrder(
    projectId: string,
    status: TaskStatus,
  ): Promise<number> {
    const count = await this.model.countDocuments({
      project: projectId,
      status,
    });
    return count;
  }

  /**
   * `progress` on ClientProject used to be hand-entered by the PM (see the
   * schema comment) — now it's derived here after every task mutation.
   * Weighted by estimateHours where set; a task with no estimate counts as
   * weight 1 rather than 0, so a project's progress isn't stuck at 0 just
   * because nobody's estimated anything yet. A project with zero tasks is
   * left alone (nothing to derive from).
   */
  private async recomputeProgress(projectId: string): Promise<void> {
    const tasks = await this.model
      .find({ project: projectId })
      .select('status estimateHours')
      .lean();
    if (tasks.length === 0) return;

    let totalWeight = 0;
    let doneWeight = 0;
    for (const task of tasks) {
      const weight =
        task.estimateHours && task.estimateHours > 0 ? task.estimateHours : 1;
      totalWeight += weight;
      if (task.status === TaskStatus.DONE) doneWeight += weight;
    }

    const progress =
      totalWeight > 0 ? Math.round((doneWeight / totalWeight) * 100) : 0;
    await this.projects.applyProgress(projectId, progress);
  }
}
