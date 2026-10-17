import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { UploadService } from '@weblaud/upload-pro';
import { CareerService } from './career.service';
import { Career } from './schemas/career.schema';
import { Application } from './schemas/application.schema';
import { DashboardNotifierService } from '../mail/dashboard-notifier.service';

const DTO = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '+8801700000000',
  interestReason: 'I like analytical engines',
  coverLetter: 'Please find my details attached',
};

const RESUME = {
  originalname: 'cv.pdf',
  mimetype: 'application/pdf',
} as Express.Multer.File;

/** submitApplication casts this to an ObjectId, so it must be 24 hex chars. */
const CAREER_ID = '507f1f77bcf86cd799439011';

interface NotifyRow {
  label: string;
  value?: unknown;
  href?: string;
}

describe('CareerService — application notifications', () => {
  let service: CareerService;
  let careerModel: { findById: jest.Mock };
  let appModel: { create: jest.Mock };
  let notifier: { notifyNew: jest.Mock; adminUrl: jest.Mock };

  const notified = () =>
    notifier.notifyNew.mock.calls[0][0] as {
      kind: string;
      to?: string;
      dashboardPath: string;
      recordId?: string;
      rows: NotifyRow[];
    };

  const row = (label: string) =>
    notified().rows.find((r) => r.label === label) as NotifyRow;

  beforeEach(async () => {
    careerModel = {
      findById: jest.fn().mockResolvedValue({ title: 'Backend Engineer' }),
    };
    appModel = {
      create: jest
        .fn()
        .mockImplementation((doc: object) => ({ _id: 'app1', ...doc })),
    };
    notifier = {
      notifyNew: jest.fn().mockResolvedValue(undefined),
      adminUrl: jest
        .fn()
        .mockImplementation(
          (path: string) => `https://weblaud.com/cpadmin${path}`,
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CareerService,
        { provide: getModelToken(Career.name), useValue: careerModel },
        { provide: getModelToken(Application.name), useValue: appModel },
        {
          provide: UploadService,
          useValue: {
            upload: jest
              .fn()
              .mockResolvedValue({ url: 'https://cdn.example.com/cv.pdf' }),
          },
        },
        { provide: DashboardNotifierService, useValue: notifier },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('hr@example.com') },
        },
      ],
    }).compile();

    service = module.get(CareerService);
  });

  it('routes the notification to the HR inbox', async () => {
    await service.submitApplication(CAREER_ID, DTO, RESUME);

    expect(notified()).toEqual(
      expect.objectContaining({
        kind: 'job application',
        to: 'hr@example.com',
        recordId: 'app1',
      }),
    );
  });

  // The old application-submitted template carried only jobTitle/name/email,
  // so HR had to open the dashboard to see anything useful.
  it('includes the full applicant detail, not just name and email', async () => {
    await service.submitApplication(CAREER_ID, DTO, RESUME);

    expect(row('Position').value).toBe('Backend Engineer');
    expect(row('Name').value).toBe('Ada Lovelace');
    expect(row('Email').href).toBe('mailto:ada@example.com');
    expect(row('Phone').value).toBe('+8801700000000');
    expect(row('Why interested').value).toBe('I like analytical engines');
    expect(row('Cover letter').value).toBe('Please find my details attached');
  });

  // Not the raw storage URL: that was public, and Cloudinary served it as an
  // extensionless file nothing could open. The admin route requires a login
  // and sends a proper filename and content type.
  it('links the résumé through the admin panel, not the raw storage URL', async () => {
    await service.submitApplication(CAREER_ID, DTO, RESUME);

    expect(row('Résumé').href).toBe(
      'https://weblaud.com/cpadmin/applicants/app1/resume',
    );
    expect(row('Résumé').href).not.toContain('cdn.example.com');
    expect(row('Résumé').value).toBe('View résumé');
  });

  it('records the original filename and MIME type so the CV can be served correctly', async () => {
    await service.submitApplication(CAREER_ID, DTO, RESUME);

    expect(appModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        resumeFileName: RESUME.originalname,
        resumeMimeType: RESUME.mimetype,
      }),
    );
  });

  it('deep-links to the applicant filtered by email', async () => {
    await service.submitApplication(CAREER_ID, DTO, RESUME);

    expect(notified().dashboardPath).toBe(
      '/applicants?email=ada%40example.com',
    );
  });

  it('persists the application before attempting to notify', async () => {
    await service.submitApplication(CAREER_ID, DTO, RESUME);

    expect(appModel.create.mock.invocationCallOrder[0]).toBeLessThan(
      notifier.notifyNew.mock.invocationCallOrder[0],
    );
  });
});
