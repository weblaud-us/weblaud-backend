import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  UpdateRequest,
  UpdateRequestDocument,
  UpdateRequestStatus,
} from './schemas/update-request.schema';
import { CreateUpdateRequestDto } from './dto/create-update-request.dto';
import { CloseUpdateRequestDto } from './dto/close-update-request.dto';
import { ClientProjectService } from 'src/modules/client-project/client-project.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import {
  assertProjectAccess,
  isProjectManager,
  ProjectAccessActor,
} from 'src/common/utils/project-access.util';
import { Role } from 'src/common/enum/user.role.enum';
import { portalProjectLink } from 'src/common/utils/portal-links.util';

const REQUESTER_PICK = 'firstName lastName avatar';

@Injectable()
export class UpdateRequestService {
  constructor(
    @InjectModel(UpdateRequest.name)
    private readonly model: Model<UpdateRequestDocument>,
    private readonly clientProjects: ClientProjectService,
    private readonly notifications: NotificationService,
  ) {}

  /** Client-only ("what's the status?") — notifies the PM. */
  async create(
    projectId: string,
    dto: CreateUpdateRequestDto,
    actor: ProjectAccessActor,
  ) {
    const subject = await this.clientProjects.findAccessSubject(projectId);
    assertProjectAccess(subject, actor);

    if (actor.role !== Role.USER) {
      throw new ForbiddenException('Only a client can request an update');
    }

    const request = await this.model.create({
      project: projectId,
      requestedBy: actor._id,
      message: dto.message,
    });

    await this.notifications.notify({
      user: subject.projectManager,
      type: 'update_requested',
      title: `A client asked for an update`,
      body: dto.message,
      link: portalProjectLink(projectId, 'questions'),
    });

    return request;
  }

  async findForProject(projectId: string, actor: ProjectAccessActor) {
    const subject = await this.clientProjects.findAccessSubject(projectId);
    assertProjectAccess(subject, actor);

    return this.model
      .find({ project: projectId })
      .sort({ createdAt: -1 })
      .populate('requestedBy', REQUESTER_PICK)
      .populate('answeredBy', REQUESTER_PICK)
      .lean();
  }

  /**
   * Open questions across the given projects (undefined = every project,
   * for an admin). The caller has already worked out which projects the
   * actor may see — the portal dashboard only asks for the ones the actor
   * manages — so this does no access check.
   */
  async findOpenForProjects(projectIds?: string[]) {
    if (projectIds && projectIds.length === 0) return [];
    const query: Record<string, unknown> = { status: UpdateRequestStatus.OPEN };
    if (projectIds) query.project = { $in: projectIds };
    return this.model
      .find(query)
      .sort({ createdAt: -1 })
      .populate('project', 'name')
      .populate('requestedBy', REQUESTER_PICK)
      .lean();
  }

  /**
   * The PM closing it means "handled" (status → answered, stamped who/when
   * — the client sees their question was actually addressed, not just
   * dismissed). The original requester closing their own is just tidying up
   * a question that's no longer relevant and doesn't claim an answer.
   */
  async close(
    id: string,
    dto: CloseUpdateRequestDto,
    actor: ProjectAccessActor,
  ) {
    const request = await this.model.findById(id);
    if (!request) throw new NotFoundException('Update request not found');

    const subject = await this.clientProjects.findAccessSubject(
      request.project.toString(),
    );
    assertProjectAccess(subject, actor);

    const isRequester =
      request.requestedBy.toString() === actor._id!.toString();
    const isPm = isProjectManager(subject, actor);

    if (!isRequester && !isPm) {
      throw new ForbiddenException(
        'Only the project manager or the person who asked can close this',
      );
    }

    if (isPm) {
      // A response is required here specifically — the PM path is what
      // tells the client "your question was addressed", and that claim
      // needs an actual answer behind it, not just a status flip. The
      // requester's own close below makes no such claim, so it needs none.
      if (!dto.response?.trim()) {
        throw new BadRequestException(
          'Enter a reply before marking this answered',
        );
      }
      request.status = UpdateRequestStatus.ANSWERED;
      request.answeredBy = actor._id as any;
      request.answeredAt = new Date();
      request.response = dto.response;
      await this.notifications.notify({
        user: request.requestedBy,
        type: 'update_request_answered',
        title: `Your update request was answered`,
        body: dto.response,
        link: portalProjectLink(request.project, 'questions'),
      });
    } else {
      request.status = UpdateRequestStatus.CLOSED;
    }

    await request.save();
    return request;
  }
}
