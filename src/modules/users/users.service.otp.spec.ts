import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { MAX_OTP_ATTEMPTS, UsersService } from './users.service';
import { User } from './schemas/user.schema';
import { MailService } from 'src/modules/mail/mail.service';
import { AuditLogService } from 'src/modules/audit-log/audit-log.service';

const EMAIL = 'client@example.com';

/** `query.select()` chains in the service resolve to the given value. */
const selecting = (value: unknown) => ({
  select: jest.fn().mockResolvedValue(value),
});

describe('UsersService OTP attempts', () => {
  let service: UsersService;
  let model: {
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    updateOne: jest.Mock;
  };
  let hash: string;

  const storedUser = (overrides: Record<string, unknown> = {}) => ({
    _id: 'u1',
    email: EMAIL,
    otpCode: hash,
    otpExpires: new Date(Date.now() + 10 * 60_000),
    otpAttempts: 0,
    ...overrides,
  });

  beforeAll(async () => {
    hash = await bcrypt.hash('123456', 4);
  });

  beforeEach(async () => {
    model = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: model },
        { provide: MailService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: AuditLogService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('returns the user for the right code without counting an attempt', async () => {
    model.findOne.mockReturnValue(selecting(storedUser()));

    await expect(service.verifyOtp(EMAIL, '123456')).resolves.toMatchObject({
      _id: 'u1',
    });
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('counts a wrong code against the code it was guessed against', async () => {
    model.findOne.mockReturnValue(selecting(storedUser()));
    model.findOneAndUpdate.mockReturnValue(selecting({ otpAttempts: 1 }));

    await expect(service.verifyOtp(EMAIL, '000000')).resolves.toBeNull();
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'u1', otpCode: hash },
      { $inc: { otpAttempts: 1 } },
      { new: true },
    );
    expect(model.updateOne).not.toHaveBeenCalled();
  });

  it('discards the code when a wrong guess uses up the last attempt', async () => {
    model.findOne.mockReturnValue(
      selecting(storedUser({ otpAttempts: MAX_OTP_ATTEMPTS - 1 })),
    );
    model.findOneAndUpdate.mockReturnValue(
      selecting({ otpAttempts: MAX_OTP_ATTEMPTS }),
    );

    await expect(service.verifyOtp(EMAIL, '000000')).resolves.toBeNull();
    expect(model.updateOne).toHaveBeenCalledWith(
      { email: EMAIL },
      { $unset: { otpCode: 1, otpExpires: 1, otpAttempts: 1 } },
    );
  });

  it('rejects even the right code once the attempts are used up', async () => {
    model.findOne.mockReturnValue(
      selecting(storedUser({ otpAttempts: MAX_OTP_ATTEMPTS })),
    );

    await expect(service.verifyOtp(EMAIL, '123456')).resolves.toBeNull();
    expect(model.updateOne).toHaveBeenCalled();
  });

  it('rejects an expired code without counting it', async () => {
    model.findOne.mockReturnValue(
      selecting(storedUser({ otpExpires: new Date(Date.now() - 1000) })),
    );

    await expect(service.verifyOtp(EMAIL, '123456')).resolves.toBeNull();
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('resets the counter whenever a new code is issued', async () => {
    const expires = new Date();
    await service.saveOtp(EMAIL, 'hashed', expires);

    expect(model.updateOne).toHaveBeenCalledWith(
      { email: EMAIL },
      { otpCode: 'hashed', otpExpires: expires, otpAttempts: 0 },
    );
  });
});
