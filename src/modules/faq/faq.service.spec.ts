import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { FaqService } from './faq.service';
import { Faq } from './schemas/faq.schema';

describe('FaqService', () => {
  let service: FaqService;
  let model: {
    create: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    findByIdAndDelete: jest.Mock;
  };

  beforeEach(async () => {
    const sortMock = jest.fn().mockReturnThis();
    const skipMock = jest.fn().mockReturnThis();
    const limitMock = jest.fn().mockReturnThis();
    const leanMock = jest.fn().mockResolvedValue([]);

    model = {
      create: jest.fn(),
      find: jest.fn().mockReturnValue({
        sort: sortMock,
        skip: skipMock,
        limit: limitMock,
        lean: leanMock,
      }),
      countDocuments: jest.fn().mockResolvedValue(0),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FaqService,
        { provide: getModelToken(Faq.name), useValue: model },
      ],
    }).compile();

    service = module.get<FaqService>(FaqService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAllPublic filters by isActive and sorts by order', async () => {
    await service.findAllPublic();

    expect(model.find).toHaveBeenCalledWith({ isActive: true });
    const findResult = model.find.mock.results[0].value;
    expect(findResult.sort).toHaveBeenCalledWith({
      order: 1,
      createdAt: -1,
    });
  });

  it('update throws NotFoundException when the id does not exist', async () => {
    model.findByIdAndUpdate.mockResolvedValue(null);

    await expect(service.update('missing-id', {})).rejects.toThrow(
      NotFoundException,
    );
  });

  it('delete throws NotFoundException when the id does not exist', async () => {
    model.findByIdAndDelete.mockResolvedValue(null);

    await expect(service.delete('missing-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('delete resolves with deleted:true when the document existed', async () => {
    model.findByIdAndDelete.mockResolvedValue({ _id: '1' });

    await expect(service.delete('1')).resolves.toEqual({ deleted: true });
  });
});
