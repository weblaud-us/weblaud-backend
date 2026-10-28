import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

  /**
   * Approval asserts the quote is genuine and the author agreed to publish it,
   * so it needs a written record of who confirmed that.
   */
  private assertApprovable(approved?: boolean, evidenceNote?: string) {
    if (approved && !evidenceNote?.trim()) {
      throw new BadRequestException(
        'Record the evidence and publication permission before approving this testimonial',
      );
    }
  }

  async create(dto: CreateTestimonialDto) {
    this.assertApprovable(dto.publicationApproved, dto.evidenceNote);
    return await this.testimonialModel.create(dto);
  }

  /** Approved, active quotes only — without the internal evidence note. */
  async findAllPublic() {
    return await this.testimonialModel
      .find({ isActive: true, publicationApproved: true })
      .select('-evidenceNote')
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

  async findOneForAdmin(id: string) {
    const testimonial = await this.testimonialModel.findById(id).lean();
    if (!testimonial) throw new NotFoundException('Testimonial not found');
    return testimonial;
  }

  async update(id: string, dto: UpdateTestimonialDto) {
    if (
      dto.publicationApproved !== undefined ||
      dto.evidenceNote !== undefined
    ) {
      const current = await this.testimonialModel.findById(id).lean();
      if (!current) throw new NotFoundException('Testimonial not found');
      this.assertApprovable(
        dto.publicationApproved ?? current.publicationApproved,
        dto.evidenceNote ?? current.evidenceNote,
      );
    }
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
