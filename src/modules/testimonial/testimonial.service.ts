import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Testimonial, TestimonialDocument } from './schemas/testimonial.schema';
import { CreateTestimonialDto } from './dto/create-testimonial.dto';
import { UpdateTestimonialDto } from './dto/update-testimonial.dto';

@Injectable()
export class TestimonialsService {
  constructor(
    @InjectModel(Testimonial.name)
    private readonly testimonialModel: Model<TestimonialDocument>,
  ) {}

  async create(dto: CreateTestimonialDto) {
    return await this.testimonialModel.create(dto);
  }

  async findAllPublic() {
    return await this.testimonialModel
      .find({ isActive: true })
      .sort({ createdAt: -1 })
      .lean();
  }

  async findAllAdmin(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const items = await this.testimonialModel
      .find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await this.testimonialModel.countDocuments();

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

  async update(id: string, dto: UpdateTestimonialDto) {
    const updated = await this.testimonialModel.findByIdAndUpdate(id, dto, {
      new: true,
    });
    if (!updated) throw new NotFoundException('Testimonial not found');
    return updated;
  }

  async delete(id: string) {
    const deleted = await this.testimonialModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('Testimonial not found');
    return { deleted: true };
  }
}
