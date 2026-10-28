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
import {
  Project,
  ProjectDocument,
  PUBLISHED_STATUSES,
} from './schema/project.schema';
import { slugify } from 'src/common/utils/slugify.util';

@Injectable()
export class ProjectService {
  constructor(
    @InjectModel(Project.name)
    private readonly projectModel: Model<ProjectDocument>,
    private readonly uploadService: UploadService,
  ) {}

  private async generateUniqueSlug(
    source: string,
    excludeId?: string,
  ): Promise<string> {
    const base = slugify(source);
    let candidate = base;
    let suffix = 2;

    while (
      await this.projectModel.exists({
        slug: candidate,
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
    ) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  /**
   * Public reads: published records only, without internal notes. A record
   * with no `publicationStatus` (written before the field existed) does not
   * match, so it stays a draft until someone in the CMS publishes it.
   */
  private static readonly PUBLIC_FILTER = {
    publicationStatus: { $in: PUBLISHED_STATUSES },
  };
  private static readonly PUBLIC_PROJECTION = '-evidenceNotes';

  /**
   * A verified case study is a claim about delivered client work, so it needs
   * a written record of its evidence and publication permission first.
   */
  private assertPublishable(
    status: string | undefined,
    evidenceNotes: string | undefined,
  ) {
    if (status === 'verified' && !evidenceNotes?.trim()) {
      throw new BadRequestException(
        'A verified case study needs evidence notes recording its source and publication permission',
      );
    }
  }

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

    this.assertPublishable(dto.publicationStatus, dto.evidenceNotes);
    const slug = await this.generateUniqueSlug(dto.slug ?? dto.name);

    return this.projectModel.create({
      ...dto,
      slug,
      createdBy: new Types.ObjectId(userId),
      coverImage,
      detailImages,
    });
  }

  async findAllPublic() {
    return this.projectModel
      .find(ProjectService.PUBLIC_FILTER)
      .select(ProjectService.PUBLIC_PROJECTION)
      .sort({ createdAt: -1 })
      .lean();
  }

  /** Drafts 404 exactly like a missing slug, so their existence isn't leaked. */
  async findPublicBySlug(slug: string) {
    const project = await this.projectModel
      .findOne({ slug, ...ProjectService.PUBLIC_FILTER })
      .select(ProjectService.PUBLIC_PROJECTION)
      .lean();
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async findPublicById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Project not found');
    }
    const project = await this.projectModel
      .findOne({ _id: id, ...ProjectService.PUBLIC_FILTER })
      .select(ProjectService.PUBLIC_PROJECTION)
      .lean();
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  /** Every record, drafts and internal notes included — for the CMS. */
  async findAllAdmin() {
    return this.projectModel.find().sort({ createdAt: -1 }).lean();
  }

  async findOneAdmin(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Project not found');
    }
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
    const project = await this.findOneAdmin(id);
    this.assertPublishable(
      dto.publicationStatus ?? project.publicationStatus,
      dto.evidenceNotes ?? project.evidenceNotes,
    );

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

    const slug = dto.slug
      ? await this.generateUniqueSlug(dto.slug, id)
      : undefined;

    return this.projectModel.findByIdAndUpdate(
      id,
      {
        ...dto,
        ...(slug ? { slug } : {}),
        coverImage,
        detailImages: [...remaining, ...newUploads],
      },
      { new: true },
    );
  }

  async delete(id: string) {
    const project = await this.findOneAdmin(id);

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
