import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateContactDto } from './create-contact.dto';

const VALID = {
  firstName: 'José',
  lastName: "O'Brien",
  email: 'jose@example.com',
  message: 'We need an operations platform.',
};

const errorsFor = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(CreateContactDto, body))).map(
    (e) => e.property,
  );

describe('CreateContactDto', () => {
  it('accepts a submission without the optional qualifiers', async () => {
    await expect(errorsFor(VALID)).resolves.toEqual([]);
  });

  it('accepts known budget and timeline values', async () => {
    await expect(
      errorsFor({ ...VALID, budget: '25k_50k', timeline: 'asap' }),
    ).resolves.toEqual([]);
  });

  it.each(['under_10k', '10k_25k', '25k_50k', '50k_plus', 'not_sure'])(
    'accepts the current budget band %s',
    async (budget) => {
      await expect(errorsFor({ ...VALID, budget })).resolves.toEqual([]);
    },
  );

  // A page cached before the band change can still post the old values.
  it.each(['under_5k', '5k_10k', '10k_20k', '20k_plus'])(
    'still accepts the legacy budget band %s',
    async (budget) => {
      await expect(errorsFor({ ...VALID, budget })).resolves.toEqual([]);
    },
  );

  it('rejects budget and timeline values outside the published lists', async () => {
    await expect(
      errorsFor({ ...VALID, budget: '$1m', timeline: 'yesterday' }),
    ).resolves.toEqual(expect.arrayContaining(['budget', 'timeline']));
  });

  it('allows messages up to 5,000 characters', async () => {
    await expect(
      errorsFor({ ...VALID, message: 'x'.repeat(5000) }),
    ).resolves.toEqual([]);
    await expect(
      errorsFor({ ...VALID, message: 'x'.repeat(5001) }),
    ).resolves.toEqual(['message']);
  });
});
