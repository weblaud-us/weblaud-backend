import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { UploadService } from '@weblaud/upload-pro';
import { ProjectService } from './project.service';
import { Project } from './schema/project.schema';

const PUBLISHED = { publicationStatus: { $in: ['illustrative', 'verified'] } };
const ID = '6a7a0eb7b58e50d70d9b9434';

/** A chainable query whose terminal `.lean()` resolves to `result`. */
function query(result: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

describe('ProjectService publication rules', () => {
  let service: ProjectService;
  let model: Record<string, jest.Mock>;

  beforeEach(async () => {
    model = {
      find: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      exists: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((doc) => Promise.resolve(doc)),
    };
    const module = await Test.createTestingModule({
      providers: [
        ProjectService,
        { provide: getModelToken(Project.name), useValue: model },
        {
          provide: UploadService,
          useValue: { upload: jest.fn(), delete: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(ProjectService);
  });

  it('lists only published records, without internal notes', async () => {
    const q = query([]);
    model.find.mockReturnValue(q);

    await service.findAllPublic();

    expect(model.find).toHaveBeenCalledWith(PUBLISHED);
    expect(q.select).toHaveBeenCalledWith('-evidenceNotes');
  });

  it('404s a draft (or status-less) slug like a missing one', async () => {
    const q = query(null);
    model.findOne.mockReturnValue(q);

    await expect(service.findPublicBySlug('a-draft')).rejects.toThrow(
      NotFoundException,
    );
    expect(model.findOne).toHaveBeenCalledWith({
      slug: 'a-draft',
      ...PUBLISHED,
    });
    expect(q.select).toHaveBeenCalledWith('-evidenceNotes');
  });

  it('applies the same rules to the public by-id read', async () => {
    model.findOne.mockReturnValue(query(null));

    await expect(service.findPublicById(ID)).rejects.toThrow(NotFoundException);
    expect(model.findOne).toHaveBeenCalledWith({ _id: ID, ...PUBLISHED });
    await expect(service.findPublicById('not-an-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('gives the CMS every record, drafts and notes included', async () => {
    const q = query([{ slug: 'a-draft', evidenceNotes: 'internal' }]);
    model.find.mockReturnValue(q);

    await expect(service.findAllAdmin()).resolves.toEqual([
      { slug: 'a-draft', evidenceNotes: 'internal' },
    ]);
    expect(model.find).toHaveBeenCalledWith();
    expect(q.select).not.toHaveBeenCalled();
  });

  it('refuses a verified study without evidence notes', async () => {
    await expect(
      service.create(
        { name: 'X', publicationStatus: 'verified', evidenceNotes: '  ' },
        ID,
        {},
      ),
    ).rejects.toThrow(BadRequestException);
    expect(model.create).not.toHaveBeenCalled();
  });

  it('leaves the status to the schema default (draft) when none is given', async () => {
    await service.create({ name: 'X' }, ID, {});
    const [created] = model.create.mock.calls[0] as [Record<string, unknown>];
    expect(created).not.toHaveProperty('publicationStatus');
  });

  it('checks the stored notes when an update only changes the status', async () => {
    model.findById.mockResolvedValue({
      publicationStatus: 'illustrative',
      evidenceNotes: '',
      detailImages: [],
    });

    await expect(
      service.update(
        ID,
        { publicationStatus: 'verified', keepCover: 'true' },
        ID,
        {},
      ),
    ).rejects.toThrow(BadRequestException);
    expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
