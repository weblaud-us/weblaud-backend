import { ValidationPipe } from '@nestjs/common';
import { UpdateTeamMemberDto } from 'src/modules/team/dto/update-team.dto';
import { CreateProjectDto } from 'src/modules/project/dto/create-project.dto';
import { UpdateProjectDto } from 'src/modules/project/dto/update-project.dto';
import { CreateServiceDto } from 'src/modules/services/dto/create-service.dto';

/**
 * Every case here is a body the admin dashboard actually posts, spelled the
 * way multer hands it to Nest: multipart values are text, and a repeated field
 * is only an array once it occurs twice. The pipe is configured exactly as
 * `main.ts` configures the global one.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const run = <T>(metatype: new () => T, body: Record<string, unknown>) =>
  pipe.transform(body, { type: 'body', metatype }) as Promise<T>;

describe('team member (PATCH /team/:id)', () => {
  const base = { name: 'Ada', title: 'Engineer' };

  it('unchecking the box saves isActive: false', async () => {
    await expect(run(UpdateTeamMemberDto, { ...base, isActive: 'false' })).resolves.toMatchObject(
      { isActive: false },
    );
  });

  it('checking the box saves isActive: true', async () => {
    await expect(run(UpdateTeamMemberDto, { ...base, isActive: 'true' })).resolves.toMatchObject(
      { isActive: true },
    );
  });

  it('leaves a real boolean alone', async () => {
    await expect(run(UpdateTeamMemberDto, { ...base, isActive: false })).resolves.toMatchObject(
      { isActive: false },
    );
  });

  it('omits isActive entirely when the field is absent', async () => {
    await expect(run(UpdateTeamMemberDto, base)).resolves.not.toHaveProperty('isActive');
  });

  it('parses the social links back into an object', async () => {
    const social = { linkedin: 'https://in/ada', facebook: '', twitter: '' };
    await expect(
      run(UpdateTeamMemberDto, { ...base, social: JSON.stringify(social) }),
    ).resolves.toMatchObject({ social });
  });

  it('rejects social that is not an object', async () => {
    await expect(run(UpdateTeamMemberDto, { ...base, social: 'not json' })).rejects.toThrow();
  });
});

describe('project (POST /projects, PATCH /projects/:id)', () => {
  const base = { name: 'Acme rebuild' };

  it('accepts a single feature, which arrives as a bare string', async () => {
    await expect(
      run(CreateProjectDto, { ...base, featureList: 'Realtime sync' }),
    ).resolves.toMatchObject({ featureList: ['Realtime sync'] });
  });

  it('accepts several features, which arrive as an array', async () => {
    await expect(
      run(CreateProjectDto, { ...base, techStack: ['Nest', 'React'] }),
    ).resolves.toMatchObject({ techStack: ['Nest', 'React'] });
  });

  it('keeps a single retained detail image as an array', async () => {
    // ProjectService.update calls keepDetails.includes(url); a bare string
    // there does substring matching instead of element matching.
    await expect(
      run(UpdateProjectDto, { ...base, keepDetails: 'projects/a.png' }),
    ).resolves.toMatchObject({ keepDetails: ['projects/a.png'] });
  });
});

describe('service (POST /services, PUT /services/:id)', () => {
  const base = { title: 'Web apps', description: 'We build them' };

  it('accepts a single feature bullet', async () => {
    await expect(run(CreateServiceDto, { ...base, features: 'Fast' })).resolves.toMatchObject({
      features: ['Fast'],
    });
  });

  it('accepts several feature bullets', async () => {
    await expect(
      run(CreateServiceDto, { ...base, features: ['Fast', 'Cheap'] }),
    ).resolves.toMatchObject({ features: ['Fast', 'Cheap'] });
  });
});
