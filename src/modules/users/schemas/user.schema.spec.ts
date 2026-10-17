import { model } from 'mongoose';
import { User, UserSchema, USER_SECRET_FIELDS } from './user.schema';

/**
 * The login response used to carry the bcrypt password hash and /users/me
 * the refresh-token hash — any query that selected them (+password,
 * +refreshToken) also serialized them. The schema transform strips them.
 */
describe('User serialization', () => {
  const UserModel = model(User.name, UserSchema);

  const doc = new UserModel({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    password: '$2b$10$hash',
    refreshToken: '$2b$10$refresh',
    otpCode: '$2b$10$otp',
    otpExpires: new Date(),
    inviteToken: '$2b$10$invite',
    inviteTokenExpires: new Date(),
  });

  it.each(['toJSON', 'toObject'] as const)(
    '%s never includes credential fields',
    (method) => {
      const plain = doc[method]() as unknown as Record<string, unknown>;
      for (const field of USER_SECRET_FIELDS) {
        expect(plain).not.toHaveProperty(field);
      }
      expect(plain.email).toBe('ada@example.com');
    },
  );

  it('keeps the secrets readable on the document itself, for the auth code', () => {
    expect(doc.password).toBe('$2b$10$hash');
    expect(doc.refreshToken).toBe('$2b$10$refresh');
  });

  it('serializes to JSON (HTTP responses) without them', () => {
    const json = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
    expect(json).not.toHaveProperty('password');
    expect(json).not.toHaveProperty('refreshToken');
  });
});
