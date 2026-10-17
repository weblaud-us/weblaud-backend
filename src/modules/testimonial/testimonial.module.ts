import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TestimonialsController } from './testimonial.controller';
import { TestimonialsService } from './testimonial.service';
import { Testimonial, TestimonialSchema } from './schemas/testimonial.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Testimonial.name, schema: TestimonialSchema },
    ]),
  ],
  controllers: [TestimonialsController],
  providers: [TestimonialsService],
  exports: [TestimonialsService],
})
export class TestimonialsModule {}
