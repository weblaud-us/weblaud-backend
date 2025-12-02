import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
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
    const coverImage = files.cover?.[0]
      ? await this.uploadFile(files.cover[0])
      : undefined;

    const detailImages = files.details
      ? await Promise.all(files.details.map((f) => this.uploadFile(f)))
      : [];

    return this.projectModel.create({
      ...dto,
      createdBy: new Types.ObjectId(userId),
      coverImage,
      detailImages,
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
    let coverImage = project.coverImage;

    if (!dto.keepCover) {
      if (coverImage) await this.deleteFile(coverImage);
      coverImage = files.cover?.[0]
        ? await this.uploadFile(files.cover[0])
        : '';
    }

    // ---------- DETAILS ----------
    const keep = dto.keepDetails ?? [];
    const remaining = project.detailImages.filter((url) => keep.includes(url));
    const removed = project.detailImages.filter((url) => !keep.includes(url));

    for (const url of removed) {
      await this.deleteFile(url);
    }

    const newUploads = files.details
      ? await Promise.all(files.details.map((f) => this.uploadFile(f)))
      : [];

    return this.projectModel.findByIdAndUpdate(
      id,
      {
        ...dto,
        coverImage,
        detailImages: [...remaining, ...newUploads],
      },
      { new: true },
    );
  }

  async delete(id: string) {
    const project = await this.findOne(id);

    if (project.coverImage) await this.deleteFile(project.coverImage);

    for (const url of project.detailImages) {
      await this.deleteFile(url);
    }

    await project.deleteOne();
    return { deleted: true };
  }

  // ================================
  //     FILE HELPERS
  // ================================

  private async uploadFile(file: Express.Multer.File): Promise<string> {
    const uploaded = await this.uploadService.upload(file, {
      folder: 'projects',
    });

    // Return the URL (works for both S3 and local)
    return uploaded.url ?? uploaded.path ?? '';
  }

  private async deleteFile(urlOrPath: string) {
    if (!urlOrPath) return;

    // Extract the key/path from the URL for deletion
    // For S3: extract the key from the URL
    // For local: it's already the path
    const identifier = urlOrPath.includes('amazonaws.com')
      ? urlOrPath.split('.com/')[1] // Extract S3 key from URL
      : urlOrPath;

    if (identifier) {
      await this.uploadService.delete(identifier);
    }
  }
}
