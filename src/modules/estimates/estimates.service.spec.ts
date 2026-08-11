import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { EstimatesService } from './estimates.service';
import { Estimate } from './schemas/estimate.schema';
import { MailService } from '../mail/mail.service';
import { CalculatorConfigService } from '../calculator-config/calculator-config.service';

const CONFIG = {
  baseCost: 4500,
  rangeSpreadPct: 0.28,
  roundToNearest: 500,
  projectTypes: [
    { id: 'operations', title: 'Operations', weeks: 6, costMultiplier: 1.0 },
  ],
  features: [{ id: 'auth', title: 'Auth', weeks: 1, costMultiplier: 0.1 }],
  timelineSpeeds: [
    { id: 'standard', label: 'Standard', multiplier: 1.0, weeksOffset: 0 },
  ],
};

const VALID_DTO = {
  name: 'Ada',
  email: 'ada@example.com',
  projectTypeId: 'operations',
  featureIds: ['auth'],
  speedId: 'standard',
};

describe('EstimatesService', () => {
  let service: EstimatesService;
  let model: { create: jest.Mock; find: jest.Mock; countDocuments: jest.Mock; findByIdAndUpdate: jest.Mock; findByIdAndDelete: jest.Mock };
  let mail: { sendEmail: jest.Mock };
  let config: { getPublic: jest.Mock };

  beforeEach(async () => {
    model = {
      create: jest.fn().mockImplementation((doc) => ({ _id: 'abc', ...doc })),
      find: jest.fn(),
      countDocuments: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };
    mail = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    config = { getPublic: jest.fn().mockResolvedValue(CONFIG) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EstimatesService,
        { provide: getModelToken(Estimate.name), useValue: model },
        { provide: MailService, useValue: mail },
        { provide: CalculatorConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(EstimatesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('recomputes the estimate server side and snapshots the selection', async () => {
    await service.submit(VALID_DTO);

    const saved = model.create.mock.calls[0][0];
    // 4500 * 1.0 * 1.1 = 4950 -> 5000; 5000 * 1.28 = 6400 -> 6500
    expect(saved.result).toEqual({ totalWeeks: 7, costMin: 5000, costMax: 6500 });
    expect(saved.selection.projectTypeTitle).toBe('Operations');
    expect(saved.selection.featureTitles).toEqual(['Auth']);
    expect(saved.selection.speedLabel).toBe('Standard');
  });

  it('ignores client-supplied price fields', async () => {
    await service.submit({ ...VALID_DTO, costMin: 1, totalWeeks: 99 } as never);

    const saved = model.create.mock.calls[0][0];
    expect(saved.result.costMin).toBe(5000);
    expect(saved.result.totalWeeks).toBe(7);
  });

  it('emails the admin a notification', async () => {
    await service.submit(VALID_DTO);

    expect(mail.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'estimate',
        context: expect.objectContaining({
          costMin: '$5,000',
          costMax: '$6,500',
          features: ['Auth'],
        }),
      }),
    );
  });

  it('still returns the saved lead when the notification email fails', async () => {
    mail.sendEmail.mockRejectedValue(new Error('smtp down'));

    await expect(service.submit(VALID_DTO)).resolves.toBeDefined();
    expect(model.create).toHaveBeenCalled();
  });

  it.each([
    ['project type', { projectTypeId: 'nope' }],
    ['delivery pace', { speedId: 'nope' }],
    ['capability', { featureIds: ['nope'] }],
  ])('rejects an unknown %s', async (_label, override) => {
    await expect(service.submit({ ...VALID_DTO, ...override })).rejects.toThrow(
      BadRequestException,
    );
    expect(model.create).not.toHaveBeenCalled();
  });

  it('rejects submissions while the calculator is unconfigured', async () => {
    config.getPublic.mockResolvedValue({
      baseCost: 4500,
      projectTypes: [],
      features: [],
      timelineSpeeds: [],
    });

    await expect(service.submit(VALID_DTO)).rejects.toThrow(BadRequestException);
  });
});
