import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import { MailService } from 'src/modules/mail/mail.service';
import { AuditLogService } from 'src/modules/audit-log/audit-log.service';

describe('UsersService.findDigestRecipientsForOrgs', () => {
  it('asks only for active client users who have not opted out, grouped by org', async () => {
    const lean = jest.fn().mockResolvedValue([
      { _id: 'u1', email: 'a@x.test', organization: 'org1' },
      { _id: 'u2', email: 'b@x.test', organization: 'org1' },
      { _id: 'u3', email: 'c@x.test', organization: 'org2' },
    ]);
    const find = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean }) });
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: { find } },
        { provide: MailService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: AuditLogService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    const byOrg = await moduleRef.get(UsersService).findDigestRecipientsForOrgs(['org1', 'org2']);

    expect(find).toHaveBeenCalledWith({
      organization: { $in: ['org1', 'org2'] },
      role: 'user',
      isActive: true,
      // A missing preference (older accounts) counts as opted in.
      'emailPreferences.digest': { $ne: false },
    });
    expect(byOrg.get('org1')?.map((u) => u._id)).toEqual(['u1', 'u2']);
    expect(byOrg.get('org2')).toHaveLength(1);
  });
});
