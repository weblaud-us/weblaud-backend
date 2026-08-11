import { Test, TestingModule } from '@nestjs/testing';
import { EstimatesController } from './estimates.controller';
import { EstimatesService } from './estimates.service';

describe('EstimatesController', () => {
  let controller: EstimatesController;
  let service: {
    submit: jest.Mock;
    findAll: jest.Mock;
    markRead: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      submit: jest.fn().mockResolvedValue({ _id: 'abc' }),
      findAll: jest.fn().mockResolvedValue({ items: [], meta: {} }),
      markRead: jest.fn().mockResolvedValue({ _id: 'abc', status: 'read' }),
      delete: jest.fn().mockResolvedValue({ deleted: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EstimatesController],
      providers: [{ provide: EstimatesService, useValue: service }],
    }).compile();

    controller = module.get(EstimatesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('forwards a submission to the service', async () => {
    const dto = {
      name: 'Ada',
      email: 'ada@example.com',
      projectTypeId: 'operations',
      featureIds: [],
      speedId: 'standard',
    };

    await expect(controller.submit(dto)).resolves.toEqual({ _id: 'abc' });
    expect(service.submit).toHaveBeenCalledWith(dto);
  });

  it('exposes paginated listing, mark-read and delete', async () => {
    await controller.getAll(2, 10);
    expect(service.findAll).toHaveBeenCalledWith(2, 10);

    await controller.markRead('abc');
    expect(service.markRead).toHaveBeenCalledWith('abc');

    await controller.delete('abc');
    expect(service.delete).toHaveBeenCalledWith('abc');
  });
});
