import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectMedia, MediaType } from './types/media.type';
import { UploadService } from '@weblaud/upload-pro';
import { Project, ProjectDocument } from './schema/project.schema';

@Injectable()
export class ProjectService {
  constructor(
    @InjectModel(Project.name)
    private readonly projectModel: Model<ProjectDocument>,
    private readonly uploadService: UploadService,
  ) {}

  async create(
    dto: CreateProjectDto,
    userId: string,
    files: {
      cover?: Express.Multer.File[];
      details?: Express.Multer.File[];
    },
  ) {
    const coverMedia = files.cover?.[0]
      ? await this.createMedia(userId, files.cover[0])
      : null;

    const detailsMedia = files.details
      ? await Promise.all(files.details.map((f) => this.createMedia(userId, f)))
      : [];

    return this.projectModel.create({
      ...dto,
      createdBy: new Types.ObjectId(userId),
      coverMedia,
      detailsMedia,
    });
  }

  async findAll() {
    return this.projectModel.find().sort({ createdAt: -1 });
  }

  async findOne(id: string) {
    const project = await this.projectModel.findById(id);
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async update(
    id: string,
    dto: UpdateProjectDto,
    userId: string,
    files: {
      cover?: Express.Multer.File[];
      details?: Express.Multer.File[];
    },
  ) {
    const project = await this.findOne(id);

    // ---------- COVER ----------
    let coverMedia = project.coverMedia;

    if (!dto.keepCover) {
      if (coverMedia) await this.removeMedia(coverMedia);
      coverMedia = files.cover?.[0]
        ? await this.createMedia(userId, files.cover[0])
        : null;
    }

    // ---------- DETAILS ----------
    const keep = dto.keepDetails ?? [];

    const remaining = project.detailsMedia.filter((m) => {
      const match = m.key ?? m.url ?? m.path;
      return match ? keep.includes(match) : false;
    });

    const removed = project.detailsMedia.filter((m) => {
      const match = m.key ?? m.url ?? m.path;
      return match ? !keep.includes(match) : true;
    });

    for (const r of removed) {
      await this.removeMedia(r);
    }

    const newUploads = files.details
      ? await Promise.all(files.details.map((f) => this.createMedia(userId, f)))
      : [];

    return this.projectModel.findByIdAndUpdate(
      id,
      {
        ...dto,
        coverMedia,
        detailsMedia: [...remaining, ...newUploads],
      },
      { new: true },
    );
  }

  async delete(id: string) {
    const project = await this.findOne(id);

    if (project.coverMedia) await this.removeMedia(project.coverMedia);

    for (const media of project.detailsMedia) {
      await this.removeMedia(media);
    }

    await project.deleteOne();
    return { deleted: true };
  }

  // ================================
  //     MEDIA HELPERS (STRONG TYPED)
  // ================================

private async createMedia(
  userId: string,
  file: Express.Multer.File,
): Promise<ProjectMedia> {
  const uploaded = await this.uploadService.uploadForUser(
    userId,
    file,
    'images',
  );

  const isVideo = file.mimetype.startsWith('video/');
  const type: MediaType = isVideo ? 'video' : 'image';

  // TS-safe + runtime-safe narrowing
  const storage: 'local' | 's3' =
    uploaded.storage === 's3' ? 's3' : 'local';

  return {
    storage,
    url: 'url' in uploaded ? uploaded.url : undefined,
    key: 'key' in uploaded ? uploaded.key : undefined,
    path: 'path' in uploaded ? uploaded.path : undefined,
    type,
  };
}


  private async removeMedia(media: ProjectMedia) {
    const identifier = media.key ?? media.path;
    if (!identifier) return;

    await this.uploadService.delete(identifier);
  }
}
