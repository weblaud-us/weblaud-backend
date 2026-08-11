import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Faq, FaqDocument } from './schemas/faq.schema';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';

@Injectable()
export class FaqService {
  constructor(
    @InjectModel(Faq.name)
    private readonly faqModel: Model<FaqDocument>,
  ) {}

  async create(dto: CreateFaqDto) {
    return await this.faqModel.create(dto);
  }

  async findAllPublic() {
    return await this.faqModel
      .find({ isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .lean();
  }

  async findAllAdmin(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const items = await this.faqModel
      .find()
      .sort({ order: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await this.faqModel.countDocuments();

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

  async update(id: string, dto: UpdateFaqDto) {
    const updated = await this.faqModel.findByIdAndUpdate(id, dto, {
      new: true,
    });
    if (!updated) throw new NotFoundException('FAQ not found');
    return updated;
  }

  async delete(id: string) {
    const deleted = await this.faqModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('FAQ not found');
    return { deleted: true };
  }
}
