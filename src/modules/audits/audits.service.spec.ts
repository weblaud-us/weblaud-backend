import { BadRequestException, ConflictException } from '@nestjs/common';
import { Model } from 'mongoose';
import { AuditsService } from './audits.service';
import { AuditDocument } from './schemas/audit.schema';
import { PageSpeedError, PageSpeedService } from './pagespeed.service';
import { DashboardNotifierService } from '../mail/dashboard-notifier.service';
import { LeadReplyService } from '../leads/lead-reply.service';

const ID = '652f1c2a9b1e8a0012345678';

const RESULT = {
  scores: { performance: 42, seo: 83, accessibility: 78, bestPractices: 100 },
  vitals: { lcpMs: 6123, cls: 0.05, tbtMs: 813, fcpMs: 2400 },
  issues: [
    {
      id: 'render-blocking-resources',
      title: 'Eliminate render-blocking resources',
      savingsMs: 1450,
      category: 'performance',
    },
    {
      id: 'image-alt',
      title: 'Images lack alt text',
      category: 'accessibility',
    },
  ],
};

/** Query chain stub: .sort().lean() / .select().lean() / .lean() / .exec(). */
const chain = (value: unknown) => {
  const q = {
    sort: () => q,
    select: () => q,
    lean: () => Promise.resolve(value),
    exec: () => Promise.resolve(value),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(value).then(resolve),
  };
  return q;
};

describe('AuditsService', () => {
  let model: {
    findOne: jest.Mock;
    findById: jest.Mock;
    findOneAndUpdate: jest.Mock<
      Promise<unknown>,
      [Record<string, unknown>, ...unknown[]]
    >;
    create: jest.Mock<Promise<object>, [Record<string, unknown>]>;
    updateOne: jest.Mock;
    exists: jest.Mock;
  };
  let pagespeed: { run: jest.Mock };
  let notifier: { notifyNew: jest.Mock };
  let leadReply: { sendAuditReport: jest.Mock };
  let service: AuditsService;

  beforeEach(() => {
    model = {
      findOne: jest.fn(() => chain(null)),
      findById: jest.fn(() => chain(null)),
      findOneAndUpdate: jest
        .fn<Promise<unknown>, [Record<string, unknown>, ...unknown[]]>()
        .mockResolvedValue(null),
      create: jest.fn((doc: Record<string, unknown>) =>
        Promise.resolve({ _id: ID, ...doc } as object),
      ),
      updateOne: jest.fn(() => chain({})),
      exists: jest.fn().mockResolvedValue(null),
    };
    pagespeed = { run: jest.fn().mockResolvedValue(RESULT) };
    notifier = { notifyNew: jest.fn().mockResolvedValue(undefined) };
    leadReply = { sendAuditReport: jest.fn().mockResolvedValue(true) };
    service = new AuditsService(
      model as unknown as Model<AuditDocument>,
      pagespeed as unknown as PageSpeedService,
      notifier as unknown as DashboardNotifierService,
      leadReply as unknown as LeadReplyService,
    );
  });

  describe('run', () => {
    it('rejects an address it will not audit', async () => {
      await expect(
        service.run({ url: 'http://localhost:3000', strategy: 'mobile' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(pagespeed.run).not.toHaveBeenCalled();
    });

    it('starts a run in the background and returns its id immediately', async () => {
      let finish!: (v: unknown) => void;
      pagespeed.run.mockReturnValue(new Promise((r) => (finish = r)));

      await expect(
        service.run({ url: 'example.com', strategy: 'mobile' }),
      ).resolves.toEqual({ id: ID });
      expect(model.create).toHaveBeenCalledWith({
        url: 'https://example.com',
        host: 'example.com',
        strategy: 'mobile',
        runStatus: 'running',
      });
      expect(pagespeed.run).toHaveBeenCalledWith(
        'https://example.com',
        'mobile',
      );
      expect(model.updateOne).not.toHaveBeenCalled();

      finish(RESULT);
      await new Promise((r) => setImmediate(r));
      expect(model.updateOne).toHaveBeenCalledWith(
        { _id: ID },
        expect.objectContaining({ runStatus: 'done', scores: RESULT.scores }),
      );
    });

    it('copies a result from the last day instead of calling Google again', async () => {
      model.findOne.mockReturnValue(
        chain({
          ...RESULT,
          completedAt: new Date(),
          email: 'someone@else.com',
        }),
      );

      await service.run({ url: 'https://example.com/', strategy: 'mobile' });

      expect(pagespeed.run).not.toHaveBeenCalled();
      const [copy] = model.create.mock.calls[0];
      expect(copy).toMatchObject({ runStatus: 'done', scores: RESULT.scores });
      // A fresh record, so this visitor can claim their own report.
      expect(copy).not.toHaveProperty('email');
    });
  });

  describe('complete', () => {
    it('records a PageSpeed failure with its reason, without throwing', async () => {
      pagespeed.run.mockRejectedValue(new PageSpeedError('quota', '429'));

      await expect(
        service.complete(ID, 'https://example.com', 'mobile'),
      ).resolves.toBeUndefined();
      expect(model.updateOne).toHaveBeenCalledWith(
        { _id: ID },
        expect.objectContaining({
          runStatus: 'failed',
          failureReason: 'quota',
        }),
      );
    });
  });

  describe('getPublic', () => {
    it('reveals scores and an issue count, never contact details or the issues', async () => {
      model.findById.mockReturnValue(
        chain({
          _id: ID,
          url: 'https://example.com',
          host: 'example.com',
          strategy: 'mobile',
          runStatus: 'done',
          ...RESULT,
          email: 'ada@example.com',
          name: 'Ada',
          createdAt: new Date(),
        }),
      );

      const result = await service.getPublic(ID);

      expect(result).toMatchObject({
        runStatus: 'done',
        scores: RESULT.scores,
        issueCount: 2,
        claimed: true,
      });
      expect(JSON.stringify(result)).not.toMatch(
        /ada@example\.com|Ada|render-blocking/,
      );
    });

    it('reports a run lost mid-way as failed rather than running forever', async () => {
      model.findById.mockReturnValue(
        chain({
          _id: ID,
          runStatus: 'running',
          issues: [],
          createdAt: new Date(Date.now() - 10 * 60 * 1000),
        }),
      );

      await expect(service.getPublic(ID)).resolves.toMatchObject({
        runStatus: 'failed',
        failureReason: 'timeout',
      });
    });

    it('404s on a malformed id without querying', async () => {
      await expect(service.getPublic('not-an-id')).rejects.toThrow(
        'Audit not found',
      );
      expect(model.findById).not.toHaveBeenCalled();
    });
  });

  describe('claim', () => {
    const CLAIM = {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      heardAbout: 'google',
    };
    const claimed = {
      _id: ID,
      url: 'https://example.com',
      host: 'example.com',
      strategy: 'mobile',
      ...RESULT,
      ...CLAIM,
    };

    it('turns the audit into a lead, notifies the team and emails the report', async () => {
      model.findOneAndUpdate.mockResolvedValue(claimed);

      await expect(service.claim(ID, CLAIM)).resolves.toEqual({
        received: true,
      });

      const [filter] = model.findOneAndUpdate.mock.calls[0];
      expect(filter).toEqual({
        _id: ID,
        runStatus: 'done',
        email: { $exists: false },
      });
      expect(notifier.notifyNew).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'website audit',
          dashboardPath: '/audit-submissions',
        }),
      );
      expect(leadReply.sendAuditReport).toHaveBeenCalledWith(
        'ada@example.com',
        'Ada Lovelace',
        expect.objectContaining({ host: 'example.com', scores: RESULT.scores }),
      );
      expect(model.updateOne).toHaveBeenCalledWith(
        { _id: ID },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest matcher
        { autoReplySentAt: expect.any(Date) },
      );
    });

    it('skips the email when this address already got one today', async () => {
      model.findOneAndUpdate.mockResolvedValue(claimed);
      model.exists.mockResolvedValue({ _id: 'earlier' });

      await service.claim(ID, CLAIM);

      expect(notifier.notifyNew).toHaveBeenCalled();
      expect(leadReply.sendAuditReport).not.toHaveBeenCalled();
    });

    it('refuses a second claim and an unfinished run', async () => {
      model.findById.mockReturnValue(
        chain({ runStatus: 'done', email: 'x@y.com' }),
      );
      await expect(service.claim(ID, CLAIM)).rejects.toThrow(
        'already been sent',
      );

      model.findById.mockReturnValue(chain({ runStatus: 'running' }));
      await expect(service.claim(ID, CLAIM)).rejects.toBeInstanceOf(
        ConflictException,
      );

      expect(leadReply.sendAuditReport).not.toHaveBeenCalled();
    });
  });
});
