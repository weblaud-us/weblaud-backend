import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { CalculatorConfigService } from './calculator-config.service';
import { CalculatorConfig } from './schemas/calculator-config.schema';

describe('CalculatorConfigService', () => {
  let service: CalculatorConfigService;
  let model: { findOne: jest.Mock; create: jest.Mock };
  let record: Record<string, unknown> & { save: jest.Mock };

  beforeEach(async () => {
    record = {
      baseCost: 4500,
      rangeSpreadPct: 0.28,
      roundToNearest: 500,
      projectTypes: [],
      features: [],
      timelineSpeeds: [],
      save: jest.fn().mockImplementation(function (this: unknown) {
        return record;
      }),
    };
    model = {
      findOne: jest.fn().mockResolvedValue(record),
      create: jest.fn().mockResolvedValue(record),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalculatorConfigService,
        { provide: getModelToken(CalculatorConfig.name), useValue: model },
      ],
    }).compile();

    service = module.get(CalculatorConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns the existing singleton without creating another', async () => {
    await service.getPublic();
    expect(model.findOne).toHaveBeenCalled();
    expect(model.create).not.toHaveBeenCalled();
  });

  it('creates the singleton on first read', async () => {
    model.findOne.mockResolvedValue(null);

    await service.getPublic();
    expect(model.create).toHaveBeenCalledWith({});
  });

  it('applies only the fields present on the dto', async () => {
    await service.update({ baseCost: 6000 });

    expect(record.baseCost).toBe(6000);
    expect(record.rangeSpreadPct).toBe(0.28); // untouched
    expect(record.roundToNearest).toBe(500); // untouched
    expect(record.save).toHaveBeenCalled();
  });

  it('persists the range spread and rounding increment', async () => {
    await service.update({ rangeSpreadPct: 0.5, roundToNearest: 1000 });

    expect(record.rangeSpreadPct).toBe(0.5);
    expect(record.roundToNearest).toBe(1000);
  });

  it('replaces the rate arrays wholesale', async () => {
    const projectTypes = [
      { id: 'mvp', title: 'MVP', desc: '', weeks: 4, costMultiplier: 1 },
    ];

    await service.update({ projectTypes });
    expect(record.projectTypes).toEqual(projectTypes);
  });
});
