import { BadRequestException } from '@nestjs/common';
import { AboutInfoService, toPublicAbout } from './about.service';

const record = {
  isActive: true,
  story: 'Story',
  mission: 'Mission',
  stats: {
    clients: 0,
    projects: 0,
    successRate: 0,
    followers: 0,
    experienceYears: 0,
  },
  trackRecord: [
    { title: '75+', subtitle: 'Projects Delivered' },
    {
      title: '99%',
      subtitle: 'Client Satisfaction',
      publicationApproved: false,
    },
    {
      title: '8+',
      subtitle: 'Countries Served',
      publicationApproved: true,
      evidenceNote: 'Invoices 2023-2026',
    },
  ],
};

describe('toPublicAbout', () => {
  it('keeps only approved entries and strips their evidence notes', () => {
    expect(toPublicAbout(record as never).trackRecord).toEqual([
      { title: '8+', subtitle: 'Countries Served', publicationApproved: true },
    ]);
  });

  it('never publishes the zero-default stats object', () => {
    expect(toPublicAbout(record as never)).not.toHaveProperty('stats');
  });

  it('returns an empty track record when nothing is approved', () => {
    const unapproved = {
      ...record,
      trackRecord: record.trackRecord.slice(0, 2),
    };
    expect(toPublicAbout(unapproved as never).trackRecord).toEqual([]);
  });
});

describe('AboutInfoService.updateTrackRecord', () => {
  it('refuses to approve an entry without evidence', async () => {
    const service = new AboutInfoService({} as never);
    await expect(
      service.updateTrackRecord({
        trackRecord: [
          { title: '75+', subtitle: 'Projects', publicationApproved: true },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
