import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Insight, InsightDocument } from './schemas/insight.schema';
import { CreateInsightDto } from './dto/create-insight.dto';
import { UpdateInsightDto } from './dto/update-insight.dto';
import { slugify } from 'src/common/utils/slugify.util';

@Injectable()
export class InsightService {
  constructor(
    @InjectModel(Insight.name)
    private readonly insightModel: Model<InsightDocument>,
  ) {}

  private async generateUniqueSlug(
    source: string,
    excludeId?: string,
  ): Promise<string> {
    const base = slugify(source);
    let candidate = base;
    let suffix = 2;

    while (
      await this.insightModel.exists({
        slug: candidate,
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
    ) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  async create(dto: CreateInsightDto) {
    const slug = await this.generateUniqueSlug(dto.slug ?? dto.title);

    return this.insightModel.create({ ...dto, slug });
  }

  async findAllPublic() {
    return this.insightModel
      .find({ isActive: true })
      .sort({ publishedAt: -1 })
      .lean();
  }

  async findBySlug(slug: string) {
    const insight = await this.insightModel
      .findOne({ slug, isActive: true })
      .lean();
    if (!insight) throw new NotFoundException('Insight not found');
    return insight;
  }

  async findAllAdmin(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const items = await this.insightModel
      .find()
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await this.insightModel.countDocuments();

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOneAdmin(id: string) {
    const insight = await this.insightModel.findById(id);
    if (!insight) throw new NotFoundException('Insight not found');
    return insight;
  }

  async update(id: string, dto: UpdateInsightDto) {
    const slug = dto.slug
      ? await this.generateUniqueSlug(dto.slug, id)
      : undefined;

    const updated = await this.insightModel.findByIdAndUpdate(
      id,
      { ...dto, ...(slug ? { slug } : {}) },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Insight not found');
    return updated;
  }

  async delete(id: string) {
    const deleted = await this.insightModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('Insight not found');
    return { deleted: true };
  }
}
