// See invoice.service.spec.ts: these load the User schema, which ts-jest's
// isolated compilation can't build. Behaviour comes from the mocks below.
jest.mock('src/modules/client-project/client-project.service', () => ({
  ClientProjectService: class ClientProjectService {},
}));
jest.mock('src/modules/notification/notification.service', () => ({
  NotificationService: class NotificationService {},
}));

import { TaskService } from './task.service';
import { TaskStatus } from './schemas/task.schema';
import { Role } from 'src/common/enum/user.role.enum';

const PROJECT = '507f1f77bcf86cd799439011';
const PM = '507f1f77bcf86cd799439013';
const pm = { _id: PM, role: Role.MANAGER };

describe('TaskService — completedAt (weekly digest)', () => {
  let model: Record<string, jest.Mock>;
  let service: TaskService;

  function taskDoc(status: TaskStatus, completedAt?: Date) {
    const doc: any = {
      _id: 't1',
      project: PROJECT,
      title: 'Checkout',
      status,
      completedAt,
      save: jest.fn().mockResolvedValue(undefined),
    };
    return doc;
  }

  beforeEach(() => {
    const leanEmpty = {
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };
    model = {
      create: jest.fn().mockImplementation((d) => Promise.resolve({ _id: 't1', ...d })),
      findById: jest.fn(),
      find: jest.fn().mockReturnValue(leanEmpty),
      updateOne: jest.fn().mockResolvedValue({}),
      countDocuments: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      }),
    };
    service = new TaskService(
      model as any,
      {
        findAccessSubject: jest.fn().mockResolvedValue({
          organization: 'org',
          projectManager: PM,
          team: [],
        }),
        applyProgress: jest.fn(),
      } as any,
      { notify: jest.fn() } as any,
    );
    // findOne() re-reads the populated task for the response — irrelevant here.
    jest.spyOn(service as any, 'findOne').mockResolvedValue({});
  });

  it('stamps completedAt when a task moves into done', async () => {
    const doc = taskDoc(TaskStatus.IN_REVIEW);
    model.findById.mockResolvedValue(doc);
    await service.update('t1', { status: TaskStatus.DONE } as any, pm);
    expect(doc.completedAt).toBeInstanceOf(Date);
  });

  it('keeps the original time when an already-done task is edited', async () => {
    const original = new Date('2026-10-01T10:00:00Z');
    const doc = taskDoc(TaskStatus.DONE, original);
    model.findById.mockResolvedValue(doc);
    await service.update('t1', { title: 'Checkout v2' } as any, pm);
    expect(doc.completedAt).toBe(original);
  });

  it('clears completedAt when a done task is reopened', async () => {
    const doc = taskDoc(TaskStatus.DONE, new Date('2026-10-01T10:00:00Z'));
    model.findById.mockResolvedValue(doc);
    await service.update('t1', { status: TaskStatus.IN_PROGRESS } as any, pm);
    expect(doc.completedAt).toBeUndefined();
  });

  it('stamps completedAt for a task created straight into done', async () => {
    await service.create(PROJECT, { title: 'Done already', status: TaskStatus.DONE } as any, pm);
    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({ completedAt: expect.any(Date) }),
    );
  });

  it('a drag into done keeps an existing completedAt; a drag out clears it', async () => {
    // First find() is the ownership check; later ones are recomputeProgress.
    model.find.mockReturnValueOnce({
      select: jest.fn().mockResolvedValue([{ project: PROJECT }, { project: PROJECT }]),
    });
    await service.reorder(
      {
        positions: [
          { id: 'a', status: TaskStatus.DONE, order: 0 },
          { id: 'b', status: TaskStatus.TODO, order: 0 },
        ],
      } as any,
      pm,
    );
    expect(model.updateOne).toHaveBeenCalledWith({ _id: 'a' }, [
      {
        $set: {
          status: TaskStatus.DONE,
          order: 0,
          completedAt: { $ifNull: ['$completedAt', '$$NOW'] },
        },
      },
    ]);
    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: 'b' },
      { $set: { status: TaskStatus.TODO, order: 0 }, $unset: { completedAt: 1 } },
    );
  });
});
