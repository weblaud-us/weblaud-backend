import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import mongoose, { type Connection } from 'mongoose';
import request from 'supertest';
import { UploadService } from '@weblaud/upload-pro';
import { Contact, ContactSchema } from '../src/modules/contact/schemas/contact.schema';
import { ContactController } from '../src/modules/contact/contact.controller';
import { ContactService } from '../src/modules/contact/contact.service';
import { Estimate, EstimateSchema } from '../src/modules/estimates/schemas/estimate.schema';
import { EstimatesController } from '../src/modules/estimates/estimates.controller';
import { EstimatesService } from '../src/modules/estimates/estimates.service';
import { Project, ProjectSchema } from '../src/modules/project/schema/project.schema';
import { ProjectController } from '../src/modules/project/project.controller';
import { ProjectService } from '../src/modules/project/project.service';
import { AboutInfo, AboutInfoSchema } from '../src/modules/about/schemas/about-info.schema';
import { AboutInfoController } from '../src/modules/about/about.controller';
import { AboutInfoService } from '../src/modules/about/about.service';
import { Testimonial, TestimonialSchema } from '../src/modules/testimonial/schemas/testimonial.schema';
import { TestimonialsController } from '../src/modules/testimonial/testimonial.controller';
import { TestimonialsService } from '../src/modules/testimonial/testimonial.service';
import { CalculatorConfigService } from '../src/modules/calculator-config/calculator-config.service';
import { DashboardNotifierService } from '../src/modules/mail/dashboard-notifier.service';
import { LeadReplyService } from '../src/modules/leads/lead-reply.service';
import { CaptchaGuard } from '../src/common/guards/captcha.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';

/** Real Mongo persistence and Nest HTTP/DTOs/role guards, without AppModule,
 * production config, seed jobs, SMTP, schedulers, or external CAPTCHA calls.
 * The test identity middleware and CAPTCHA substitute exist only in this app.
 */
describe('Publication and lead HTTP integration (isolated local MongoDB)', () => {
  let app: INestApplication;
  let connection: Connection;
  const database = `weblaud_audit_test_${randomUUID().replaceAll('-', '')}`;
  const notifyNew = jest.fn().mockResolvedValue(undefined);
  const sendEstimateSummary = jest.fn().mockResolvedValue(false);
  const config = {
    baseCost: 4500, rangeSpreadPct: 0.28, roundToNearest: 500,
    projectTypes: [{ id: 'operations', title: 'Operations', weeks: 20, costMultiplier: 1 }],
    features: [{ id: 'integration', title: 'Integration', weeks: 3, costMultiplier: 0.2 }],
    timelineSpeeds: [{ id: 'standard', label: 'Standard', multiplier: 1, weeksOffset: 0 }],
  };
  beforeAll(async () => {
    connection = await mongoose.createConnection(`mongodb://127.0.0.1:27018/${database}`, { serverSelectionTimeoutMS: 5000 }).asPromise();
    const schemas = [[Contact.name, ContactSchema], [Estimate.name, EstimateSchema], [Project.name, ProjectSchema], [AboutInfo.name, AboutInfoSchema], [Testimonial.name, TestimonialSchema]] as const;
    const module = await Test.createTestingModule({
      controllers: [ContactController, EstimatesController, ProjectController, AboutInfoController, TestimonialsController],
      providers: [ContactService, EstimatesService, ProjectService, AboutInfoService, TestimonialsService, RolesGuard,
        ...schemas.map(([name, schema]) => ({ provide: getModelToken(name), useValue: connection.model(name, schema as mongoose.Schema) })),
        { provide: CalculatorConfigService, useValue: { getPublic: async () => config } },
        { provide: DashboardNotifierService, useValue: { notifyNew } },
        { provide: LeadReplyService, useValue: { sendContactConfirmation: async () => false, sendEstimateSummary } },
        { provide: UploadService, useValue: { upload: jest.fn(), delete: jest.fn() } },
      ],
    }).overrideGuard(CaptchaGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    app.use((req, _res, next) => { if (req.headers['x-test-role']) req.user = { role: req.headers['x-test-role'] }; next(); });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    // Only the uniquely named database created by this test is removed.
    if (connection?.readyState === 1 && connection.name === database && /^weblaud_audit_test_[a-f0-9]{32}$/.test(database)) await connection.dropDatabase();
    await connection?.close();
  });

  it.each(['under_10k', '10k_25k', '25k_50k', '50k_plus', 'not_sure', 'under_5k', '5k_10k', '10k_20k', '20k_plus'])('persists budget %s without remapping it', async budget => {
    const email = `${budget}@example.test`;
    await request(app.getHttpServer()).post('/contact/submit').send({ firstName: 'Ada', lastName: 'Lovelace', email, budget, message: 'We need a workflow platform for our operations team.' }).expect(201);
    const stored = await connection.model(Contact.name).findOne({ email }).lean();
    expect(stored?.budget).toBe(budget);
  });

  it('rejects an unknown budget without storing a lead', async () => {
    await request(app.getHttpServer()).post('/contact/submit').send({ firstName: 'Ada', lastName: 'Lovelace', email: 'invalid@example.test', budget: 'invented', message: 'A workflow project for the team.' }).expect(400);
    expect(await connection.model(Contact.name).countDocuments({ email: 'invalid@example.test' })).toBe(0);
  });

  it('recomputes, stores and passes an uncapped estimate to the email boundary', async () => {
    const response = await request(app.getHttpServer()).post('/estimates/submit').send({ name: 'Ada', email: 'estimate@example.test', projectTypeId: 'operations', featureIds: ['integration'], speedId: 'standard', result: { totalWeeks: 1, costMin: 1 } }).expect(201);
    expect(response.body.result).toEqual(expect.objectContaining({ totalWeeks: 23, costMin: 5500, costMax: 7000 }));
    const stored = await connection.model(Estimate.name).findById(response.body._id).lean();
    expect(stored?.result.totalWeeks).toBe(23);
    expect(sendEstimateSummary).toHaveBeenCalled();
    expect(notifyNew.mock.calls.some(([payload]) => JSON.stringify(payload).includes('23 sprint weeks'))).toBe(true);
  });

  it('excludes drafts and internal notes from every public project read while keeping admin access', async () => {
    const model = connection.model(Project.name);
    const draft = await model.create({ name: 'Draft', slug: 'draft', evidenceNotes: 'PRIVATE' });
    const example = await model.create({ name: 'Example', slug: 'example', publicationStatus: 'illustrative', evidenceNotes: 'PRIVATE' });
    const old = await model.collection.insertOne({ name: 'Old', slug: 'old', evidenceNotes: 'PRIVATE' });
    const list = await request(app.getHttpServer()).get('/projects').expect(200);
    expect(list.body.map(p => p.slug)).toEqual(['example']);
    expect(JSON.stringify(list.body)).not.toContain('PRIVATE');
    for (const identifier of ['slug/draft', String(draft._id), 'slug/old', String(old.insertedId)]) await request(app.getHttpServer()).get(`/projects/${identifier}`).expect(404);
    const detail = await request(app.getHttpServer()).get(`/projects/${example._id}`).expect(200);
    expect(detail.body).not.toHaveProperty('evidenceNotes');
    await request(app.getHttpServer()).get('/projects/admin').expect(403);
    await request(app.getHttpServer()).get('/projects/admin').set('x-test-role', 'client').expect(403);
    const admin = await request(app.getHttpServer()).get(`/projects/admin/${draft._id}`).set('x-test-role', 'admin').expect(200);
    expect(admin.body.evidenceNotes).toBe('PRIVATE');
  });

  it('publishes only approved quotes and figures, without evidence notes or default zeros', async () => {
    await connection.model(Testimonial.name).create([
      { quote: 'Unapproved', authorName: 'A' },
      { quote: 'Approved verbatim', authorName: 'B', company: 'Example', sourceUrl: 'https://example.test/review', publicationApproved: true, evidenceNote: 'PRIVATE' },
    ]);
    await connection.model(AboutInfo.name).create({ trackRecord: [
      { title: '75+', subtitle: 'Unapproved' },
      { title: '8+', subtitle: 'Approved', publicationApproved: true, evidenceNote: 'PRIVATE' },
    ] });
    const quotes = await request(app.getHttpServer()).get('/testimonials').expect(200);
    expect(quotes.body.map(t => t.quote)).toEqual(['Approved verbatim']);
    expect(JSON.stringify(quotes.body)).not.toContain('PRIVATE');
    const about = await request(app.getHttpServer()).get('/about').expect(200);
    expect(about.body.trackRecord.map(t => t.title)).toEqual(['8+']);
    expect(about.body).not.toHaveProperty('stats');
    expect(JSON.stringify(about.body)).not.toContain('PRIVATE');
  });
});
