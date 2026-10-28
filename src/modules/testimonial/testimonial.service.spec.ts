import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { TestimonialsService } from './testimonial.service';
import { Testimonial } from './schemas/testimonial.schema';

describe('TestimonialsService publication rules', () => {
  let service: TestimonialsService;
  let model: Record<string, jest.Mock>;
  let publicQuery: { select: jest.Mock; sort: jest.Mock; lean: jest.Mock };

  beforeEach(async () => {
    publicQuery = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };
    model = {
      find: jest.fn().mockReturnValue(publicQuery),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn().mockResolvedValue({ _id: '1' }),
      create: jest.fn().mockImplementation((doc) => Promise.resolve(doc)),
    };
    const module = await Test.createTestingModule({
      providers: [
        TestimonialsService,
        { provide: getModelToken(Testimonial.name), useValue: model },
      ],
    }).compile();
    service = module.get(TestimonialsService);
  });

  it('publishes only active, approved quotes, without the evidence note', async () => {
    await service.findAllPublic();

    expect(model.find).toHaveBeenCalledWith({
      isActive: true,
      publicationApproved: true,
    });
    expect(publicQuery.select).toHaveBeenCalledWith('-evidenceNote');
  });

  it('refuses approval without an evidence note', async () => {
    await expect(
      service.create({
        quote: 'q',
        authorName: 'A',
        publicationApproved: true,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(model.create).not.toHaveBeenCalled();
  });

  it('approves on update when the stored note already covers it', async () => {
    model.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ evidenceNote: 'Confirmed by email' }),
    });

    await service.update('1', { publicationApproved: true });
    expect(model.findByIdAndUpdate).toHaveBeenCalled();
  });

  it('refuses to clear the note on an approved quote', async () => {
    model.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        publicationApproved: true,
        evidenceNote: 'Confirmed',
      }),
    });

    await expect(service.update('1', { evidenceNote: '' })).rejects.toThrow(
      BadRequestException,
    );
    expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('stores the quote exactly as supplied', async () => {
    const quote = '  "Exactly as supplied" - with odd spacing. ';
    await service.create({ quote, authorName: 'A' });
    expect(model.create).toHaveBeenCalledWith({ quote, authorName: 'A' });
  });
});
