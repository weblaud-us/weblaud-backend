// ClientProjectService and NotificationService transitively load the User
// schema, which ts-jest's isolated compilation can't build (see
// invoice.service.spec.ts) — replaced with dummies; behaviour comes from
// the mocks below.
jest.mock('src/modules/client-project/client-project.service', () => ({
  ClientProjectService: class ClientProjectService {},
}));
jest.mock('src/modules/notification/notification.service', () => ({
  NotificationService: class NotificationService {},
}));

import { ProjectUpdateService } from './project-update.service';
import { ProjectUpdateStatus } from './schemas/project-update.schema';
import { Role } from 'src/common/enum/user.role.enum';

const PROJECT = '507f1f77bcf86cd799439011';
const ORG = '507f1f77bcf86cd799439012';
const PM = '507f1f77bcf86cd799439013';
const DEV = '507f1f77bcf86cd799439014';

describe('ProjectUpdateService — progress has one writer (the task board)', () => {
  let service: ProjectUpdateService;
  let model: { create: jest.Mock; findById: jest.Mock };
  let clientProjects: Record<string, jest.Mock>;

  beforeEach(() => {
    model = {
      create: jest.fn().mockImplementation((doc) => Promise.resolve({ _id: 'u1', ...doc })),
      findById: jest.fn(),
    };
    clientProjects = {
      findAccessSubject: jest.fn().mockResolvedValue({
        name: 'Site rebuild',
        organization: ORG,
        projectManager: PM,
        team: [DEV],
      }),
      getClientUserIds: jest.fn().mockResolvedValue(['client1']),
      applyProgress: jest.fn(),
    };
    service = new ProjectUpdateService(
      model as any,
      clientProjects as any,
      { notify: jest.fn(), notifyMany: jest.fn() } as any,
      { record: jest.fn() } as any,
    );
  });

  it('a PM post with a progressValue publishes but leaves project.progress alone', async () => {
    const update = await service.create(
      PROJECT,
      { title: 'Week 3', body: 'Checkout done', progressValue: 40 },
      { _id: PM, role: Role.MANAGER },
    );

    expect(update.status).toBe(ProjectUpdateStatus.PUBLISHED);
    // Kept on the update as narrative…
    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({ progressValue: 40 }),
    );
    // …but never written to the project.
    expect(clientProjects.applyProgress).not.toHaveBeenCalled();
  });

  it("approving a developer's update with a progressValue leaves project.progress alone", async () => {
    const doc = {
      project: PROJECT,
      title: 'Week 3',
      author: DEV,
      status: ProjectUpdateStatus.PENDING_REVIEW,
      progressValue: 10,
      save: jest.fn().mockResolvedValue(undefined),
    };
    model.findById.mockResolvedValue(doc);

    await service.approve('u1', { _id: PM, role: Role.MANAGER });

    expect(doc.status).toBe(ProjectUpdateStatus.PUBLISHED);
    expect(clientProjects.applyProgress).not.toHaveBeenCalled();
  });
});
