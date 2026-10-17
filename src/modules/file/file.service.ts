import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { UploadService } from '@weblaud/upload-pro';
import {
  FileVisibility,
  ProjectFile,
  ProjectFileDocument,
} from './schemas/project-file.schema';
import { UploadFileDto } from './dto/upload-file.dto';
import { UpdateFileDto } from './dto/update-file.dto';
import { ClientProjectService } from 'src/modules/client-project/client-project.service';
import {
  assertProjectAccess,
  ProjectAccessActor,
} from 'src/common/utils/project-access.util';
import { Role } from 'src/common/enum/user.role.enum';
import { streamStoredFile } from 'src/common/utils/stored-file-streamer.util';

const UPLOADER_PICK = 'firstName lastName avatar';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);

  constructor(
    @InjectModel(ProjectFile.name)
    private readonly model: Model<ProjectFileDocument>,
    private readonly uploadService: UploadService,
    private readonly projects: ClientProjectService,
    private readonly config: ConfigService,
  ) {}

  async upload(
    projectId: string,
    file: Express.Multer.File,
    dto: UploadFileDto,
    actor: ProjectAccessActor & { role: Role },
  ) {
    const subject = await this.projects.findAccessSubject(projectId);
    assertProjectAccess(subject, actor);

    // A client uploading their own file obviously wants to see it — and
    // "internal" (hidden from the client) makes no sense for something a
    // client themselves put there, so their choice of visibility (if any)
    // is ignored, not merely defaulted.
    const visibility =
      actor.role === Role.USER
        ? FileVisibility.CLIENT
        : (dto.visibility ?? FileVisibility.INTERNAL);

    let version = 1;
    if (dto.supersedes) {
      const previous = await this.model.findById(dto.supersedes);
      if (previous && previous.project.toString() === projectId) {
        version = previous.version + 1;
      }
    }

    const uploaded = await this.uploadService.upload(file, {
      folder: 'project-files',
    });
    const storageKey = uploaded.url ?? uploaded.path ?? '';

    const created = await this.model.create({
      project: projectId,
      name: file.originalname,
      storageKey,
      mimeType: file.mimetype,
      size: file.size,
      uploadedBy: actor._id,
      visibility,
      version,
      supersedes: dto.supersedes,
      folder: dto.folder,
    });

    const found = await this.findOne(
      (created._id as Types.ObjectId).toString(),
      actor,
    );
    return this.stripStorageKey(found.toObject());
  }

  async findForProject(projectId: string, actor: ProjectAccessActor) {
    const subject = await this.projects.findAccessSubject(projectId);
    assertProjectAccess(subject, actor);

    const query: Record<string, unknown> = { project: projectId };
    if (actor.role === Role.USER) query.visibility = FileVisibility.CLIENT;

    const files = await this.model
      .find(query)
      .sort({ createdAt: -1 })
      .populate('uploadedBy', UPLOADER_PICK)
      .lean();
    return files.map((f) => this.stripStorageKey(f));
  }

  private async findOne(id: string, actor: ProjectAccessActor) {
    const file = await this.model
      .findById(id)
      .populate('uploadedBy', UPLOADER_PICK);
    if (!file) throw new NotFoundException('File not found');
    const subject = await this.projects.findAccessSubject(
      file.project.toString(),
    );
    assertProjectAccess(subject, actor);
    if (actor.role === Role.USER && file.visibility !== FileVisibility.CLIENT) {
      throw new ForbiddenException('You do not have access to this file');
    }
    return file;
  }

  async update(
    id: string,
    dto: UpdateFileDto,
    actor: ProjectAccessActor & { role: Role },
  ) {
    const file = await this.findAccessibleForWrite(id, actor);
    Object.assign(file, dto);
    await file.save();
    const found = await this.findOne(id, actor);
    return this.stripStorageKey(found.toObject());
  }

  async remove(id: string, actor: ProjectAccessActor & { role: Role }) {
    const file = await this.findAccessibleForWrite(id, actor);
    await file.deleteOne();
    return { deleted: true };
  }

  /** Staff can edit/delete any file on a project they're on; a client can only touch their own upload. */
  private async findAccessibleForWrite(
    id: string,
    actor: ProjectAccessActor & { role: Role },
  ): Promise<ProjectFileDocument> {
    const file = await this.model.findById(id);
    if (!file) throw new NotFoundException('File not found');
    const subject = await this.projects.findAccessSubject(
      file.project.toString(),
    );
    assertProjectAccess(subject, actor);

    if (
      actor.role === Role.USER &&
      file.uploadedBy.toString() !== actor._id?.toString()
    ) {
      throw new ForbiddenException('You can only manage files you uploaded');
    }
    return file;
  }

  async streamFile(
    id: string,
    actor: ProjectAccessActor,
    res: NodeJS.WritableStream & {
      setHeader: (name: string, value: string) => void;
    },
  ) {
    const raw = await this.model.findById(id);
    if (!raw) throw new NotFoundException('File not found');
    const subject = await this.projects.findAccessSubject(
      raw.project.toString(),
    );
    assertProjectAccess(subject, actor);
    if (actor.role === Role.USER && raw.visibility !== FileVisibility.CLIENT) {
      throw new ForbiddenException('You do not have access to this file');
    }

    res.setHeader('Content-Type', raw.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(raw.name)}"`,
    );

    await streamStoredFile(
      raw.storageKey,
      res,
      this.config,
      this.logger,
      'File',
    );
  }

  /** Mirrors ContractService.stripDocumentUrl — the raw storage key never reaches a portal caller; downloads go through streamFile instead. */
  private stripStorageKey<T extends { storageKey?: string }>(
    doc: T,
  ): Omit<T, 'storageKey'> {
    const { storageKey, ...rest } = doc;
    return rest;
  }
}
