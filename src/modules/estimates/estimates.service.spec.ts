import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { EstimatesService } from './estimates.service';
import { Estimate } from './schemas/estimate.schema';
import { DashboardNotifierService } from '../mail/dashboard-notifier.service';
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
  let model: {
    create: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    findByIdAndDelete: jest.Mock;
  };
  let notifier: { notifyNew: jest.Mock };
  let config: { getPublic: jest.Mock };

  /** Flattens the grouped sections back to rows for easier assertions. */
  const notifiedRows = () =>
    notifier.notifyNew.mock.calls[0][0].rows as {
      label: string;
      value: unknown;
    }[];

  beforeEach(async () => {
    model = {
      create: jest.fn().mockImplementation((doc) => ({ _id: 'abc', ...doc })),
      find: jest.fn(),
      countDocuments: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };
    notifier = { notifyNew: jest.fn().mockResolvedValue(undefined) };
    config = { getPublic: jest.fn().mockResolvedValue(CONFIG) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EstimatesService,
        { provide: getModelToken(Estimate.name), useValue: model },
        { provide: DashboardNotifierService, useValue: notifier },
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
    expect(saved.result).toEqual({
      totalWeeks: 7,
      costMin: 5000,
      costMax: 6500,
    });
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

  it('notifies the dashboard with the priced estimate', async () => {
    await service.submit(VALID_DTO);

    expect(notifier.notifyNew).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'project estimate',
        dashboardPath: '/estimate-submissions',
        recordId: 'abc',
      }),
    );
    expect(notifiedRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Investment range',
          value: '$5,000 – $6,500',
        }),
        expect.objectContaining({ label: 'Capabilities', value: ['Auth'] }),
        expect.objectContaining({ label: 'Timeline', value: '7 sprint weeks' }),
      ]),
    );
  });

  it('says "None selected" rather than dropping an empty capability list', async () => {
    await service.submit({ ...VALID_DTO, featureIds: [] });

    expect(notifiedRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Capabilities',
          value: 'None selected',
        }),
      ]),
    );
  });

  // The lead must be durable before we attempt to notify. The "a mail outage
  // never loses a lead" half of that guarantee now lives in
  // DashboardNotifierService, which owns the try/catch and never rejects —
  // see dashboard-notifier.service.spec.ts.
  it('persists the lead before attempting to notify', async () => {
    await service.submit(VALID_DTO);

    expect(model.create).toHaveBeenCalled();
    expect(model.create.mock.invocationCallOrder[0]).toBeLessThan(
      notifier.notifyNew.mock.invocationCallOrder[0],
    );
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

    await expect(service.submit(VALID_DTO)).rejects.toThrow(
      BadRequestException,
    );
  });
});
