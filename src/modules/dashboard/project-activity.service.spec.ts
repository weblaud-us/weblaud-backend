import { ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';

jest.mock('src/modules/client-project/client-project.service', () => ({
  ClientProjectService: class ClientProjectService {},
}));

import {
  ProjectActivityService,
  ACTIVITY_LIMIT,
} from './project-activity.service';
import { Role } from 'src/common/enum/user.role.enum';

const PROJECT = '507f1f77bcf86cd799439011';
const ORG = '507f1f77bcf86cd799439012';
const PM = '507f1f77bcf86cd799439013';

function modelReturning(rows: unknown[]) {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(rows),
  };
  return { find: jest.fn().mockReturnValue(chain) };
}

const day = (n: number) => new Date(Date.UTC(2026, 9, n));

describe('ProjectActivityService', () => {
  let updates: ReturnType<typeof modelReturning>;
  let files: ReturnType<typeof modelReturning>;
  let approvals: ReturnType<typeof modelReturning>;
  let invoices: ReturnType<typeof modelReturning>;
  let comments: ReturnType<typeof modelReturning>;
  let contracts: ReturnType<typeof modelReturning>;
  let changeRequests: ReturnType<typeof modelReturning>;
  let service: ProjectActivityService;

  beforeEach(() => {
    updates = modelReturning([
      { _id: 'u1', title: 'Week 3', publishedAt: day(10) },
    ]);
    files = modelReturning([
      { _id: 'f1', name: 'logo.png', createdAt: day(12) },
    ]);
    approvals = modelReturning([
      { _id: 'a1', title: 'Homepage', status: 'approved', decidedAt: day(11) },
      { _id: 'a2', title: 'Pricing', status: 'rejected', decidedAt: day(9) },
    ]);
    invoices = modelReturning([
      { _id: 'i1', number: 'INV-7', paidAt: day(13) },
    ]);
    comments = modelReturning([]);
    contracts = modelReturning([]);
    changeRequests = modelReturning([]);
    service = new ProjectActivityService(
      updates as any,
      files as any,
      approvals as any,
      invoices as any,
      comments as any,
      contracts as any,
      changeRequests as any,
      {
        findAccessSubject: jest.fn().mockResolvedValue({
          organization: ORG,
          projectManager: PM,
          team: [],
        }),
      } as any,
    );
  });

  it('only ever shows a client the files shared with them', async () => {
    await service.recent(PROJECT, {
      _id: 'c1',
      role: Role.USER,
      organization: ORG,
    });
    expect(files.find).toHaveBeenCalledWith({
      project: PROJECT,
      visibility: 'client',
    });
    expect(updates.find).toHaveBeenCalledWith({
      project: PROJECT,
      status: 'published',
    });
  });

  it('shows staff every file', async () => {
    await service.recent(PROJECT, { _id: PM, role: Role.MANAGER });
    expect(files.find).toHaveBeenCalledWith({ project: PROJECT });
  });

  it('merges every source newest-first with links into the right tab', async () => {
    const items = await service.recent(PROJECT, {
      _id: 'c1',
      role: Role.USER,
      organization: ORG,
    });
    expect(items.map((i) => i._id)).toEqual(['i1', 'f1', 'a1', 'u1', 'a2']);
    expect(items[0]).toMatchObject({
      title: 'Invoice INV-7 paid',
      link: '/portal/projects/' + PROJECT + '/billing/invoices',
    });
    expect(items[1].title).toBe('File shared: logo.png');
    expect(items[4].title).toBe('Changes requested: Pricing');
  });

  it('caps the list at ACTIVITY_LIMIT', async () => {
    updates = modelReturning(
      Array.from({ length: 8 }, (_, n) => ({
        _id: 'u' + n,
        title: 'U' + n,
        publishedAt: day(n + 1),
      })),
    );
    files = modelReturning(
      Array.from({ length: 8 }, (_, n) => ({
        _id: 'f' + n,
        name: 'F' + n,
        createdAt: day(n + 10),
      })),
    );
    service = new ProjectActivityService(
      updates as any,
      files as any,
      modelReturning([]) as any,
      modelReturning([]) as any,
      modelReturning([]) as any,
      modelReturning([]) as any,
      modelReturning([]) as any,
      {
        findAccessSubject: jest
          .fn()
          .mockResolvedValue({
            organization: ORG,
            projectManager: PM,
            team: [],
          }),
      } as any,
    );
    const items = await service.recent(PROJECT, {
      _id: PM,
      role: Role.MANAGER,
    });
    expect(items).toHaveLength(ACTIVITY_LIMIT);
    expect(items[0]._id).toBe('f7');
  });

  it('refuses a client from another organization', async () => {
    await expect(
      service.recent(PROJECT, {
        _id: 'c1',
        role: Role.USER,
        organization: PM,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(files.find).not.toHaveBeenCalled();
  });
});
