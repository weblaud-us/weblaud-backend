import { Test, TestingModule } from '@nestjs/testing';
import { CalculatorConfigController } from './calculator-config.controller';
import { CalculatorConfigService } from './calculator-config.service';

describe('CalculatorConfigController', () => {
  let controller: CalculatorConfigController;
  let service: { getPublic: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    service = {
      getPublic: jest.fn().mockResolvedValue({ baseCost: 4500 }),
      update: jest.fn().mockResolvedValue({ baseCost: 6000 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CalculatorConfigController],
      providers: [{ provide: CalculatorConfigService, useValue: service }],
    }).compile();

    controller = module.get(CalculatorConfigController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('serves the public config', async () => {
    await expect(controller.getPublic()).resolves.toEqual({ baseCost: 4500 });
  });

  it('forwards an update to the service', async () => {
    const dto = { baseCost: 6000, rangeSpreadPct: 0.5 };

    await expect(controller.update(dto)).resolves.toEqual({ baseCost: 6000 });
    expect(service.update).toHaveBeenCalledWith(dto);
  });
});
