import { Test, TestingModule } from '@nestjs/testing';
import { FaqController } from './faq.controller';
import { FaqService } from './faq.service';

describe('FaqController', () => {
  let controller: FaqController;
  let service: { findAllPublic: jest.Mock; findAllAdmin: jest.Mock };

  beforeEach(async () => {
    service = {
      findAllPublic: jest.fn().mockResolvedValue([]),
      findAllAdmin: jest.fn().mockResolvedValue({ items: [], meta: {} }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FaqController],
      providers: [{ provide: FaqService, useValue: service }],
    }).compile();

    controller = module.get<FaqController>(FaqController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getPublicFaqs delegates to service.findAllPublic', async () => {
    await controller.getPublicFaqs();
    expect(service.findAllPublic).toHaveBeenCalled();
  });

  it('getAdminFaqs delegates to service.findAllAdmin with page/limit', async () => {
    await controller.getAdminFaqs(2, 10);
    expect(service.findAllAdmin).toHaveBeenCalledWith(2, 10);
  });
});
