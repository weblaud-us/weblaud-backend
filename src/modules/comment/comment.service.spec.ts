import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { CommentService } from './comment.service';
import { Comment, CommentSubjectType } from './schemas/comment.schema';
import { Task } from 'src/modules/task/schemas/task.schema';
import { ProjectFile } from 'src/modules/file/schemas/project-file.schema';
import { ClientProjectService } from 'src/modules/client-project/client-project.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import { UsersService } from 'src/modules/users/users.service';
import { Role } from 'src/common/enum/user.role.enum';

const id = () => new Types.ObjectId().toString();

const PROJECT_ID = id();
const ORG_ID = id();
const OTHER_ORG_ID = id();
const PM_ID = id();
const CLIENT_ID = id();
const OUTSIDER_CLIENT_ID = id();
const PARENT_COMMENT_ID = id();

const PROJECT_SUBJECT = {
  organization: ORG_ID,
  projectManager: PM_ID,
  team: [],
};

const USERS = {
  [PM_ID]: { _id: PM_ID, role: Role.MANAGER },
  [CLIENT_ID]: { _id: CLIENT_ID, role: Role.USER, organization: ORG_ID },
  [OUTSIDER_CLIENT_ID]: {
    _id: OUTSIDER_CLIENT_ID,
    role: Role.USER,
    organization: OTHER_ORG_ID,
  },
};

describe('CommentService — who a comment may notify', () => {
  let service: CommentService;
  let model: { create: jest.Mock; findById: jest.Mock };
  let notifications: { notify: jest.Mock };

  const pm = { _id: PM_ID, role: Role.MANAGER, firstName: 'Pat' };
  const notifiedUsers = () =>
    notifications.notify.mock.calls.map(([input]) => String(input.user));

  beforeEach(async () => {
    const chain = {
      select: jest.fn().mockResolvedValue({
        author: { toString: () => CLIENT_ID },
        project: { toString: () => PROJECT_ID },
        subjectType: CommentSubjectType.PROJECT,
        subjectId: undefined,
      }),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({}),
    };
    model = {
      create: jest.fn().mockImplementation((doc) =>
        Promise.resolve({
          _id: id(),
          ...doc,
          project: { toString: () => PROJECT_ID },
          mentions: (doc.mentions as string[]).map((m) => ({
            toString: () => m,
          })),
        }),
      ),
      findById: jest.fn().mockReturnValue(chain),
    };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentService,
        { provide: getModelToken(Comment.name), useValue: model },
        { provide: getModelToken(Task.name), useValue: {} },
        { provide: getModelToken(ProjectFile.name), useValue: {} },
        {
          provide: ClientProjectService,
          useValue: {
            findAccessSubject: jest.fn().mockResolvedValue(PROJECT_SUBJECT),
          },
        },
        { provide: NotificationService, useValue: notifications },
        {
          provide: UsersService,
          useValue: {
            findAccessActors: jest
              .fn()
              .mockImplementation((ids: string[]) =>
                Promise.resolve(
                  ids.map((uid) => USERS[uid]).filter(Boolean),
                ),
              ),
          },
        },
      ],
    }).compile();

    service = module.get(CommentService);
  });

  it("does not tell a client about a staff member's internal reply to their comment", async () => {
    await service.createForProject(
      PROJECT_ID,
      { body: 'Internal: pad the quote', internal: true, parent: PARENT_COMMENT_ID },
      pm,
    );

    expect(notifiedUsers()).not.toContain(CLIENT_ID);
  });

  it('does notify the client about a normal (non-internal) reply', async () => {
    await service.createForProject(
      PROJECT_ID,
      { body: 'Done — have a look', parent: PARENT_COMMENT_ID },
      pm,
    );

    expect(notifiedUsers()).toContain(CLIENT_ID);
  });

  it('drops mentions of users with no access to the project, and never stores them', async () => {
    await service.createForProject(
      PROJECT_ID,
      { body: 'hi', mentions: [CLIENT_ID, OUTSIDER_CLIENT_ID, id()] },
      pm,
    );

    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({ mentions: [CLIENT_ID] }),
    );
    expect(notifiedUsers()).toEqual([CLIENT_ID]);
  });

  it('drops a client mention on an internal comment', async () => {
    await service.createForProject(
      PROJECT_ID,
      { body: 'staff only', internal: true, mentions: [CLIENT_ID] },
      pm,
    );

    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({ mentions: [] }),
    );
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
