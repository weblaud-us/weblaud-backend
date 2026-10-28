import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildEditorialPlan } from './editorial-review.plan';
import { EDITORIAL_REVIEW } from './editorial-review.content';
import {
  applyPlanInMemory, getPath, type ContentState,
} from '../publication-review/publication-review.plan';

const snapshot = resolve(__dirname, '../../../../weblaud-site/content/live-review/2026-10-25-publication/cms');
function state(): ContentState {
  const load = (name: string) => JSON.parse(readFileSync(resolve(snapshot, name + '.json'), 'utf8')).data;
  return {
    projects: load('projects'), services: load('services'), about: load('about'),
    faqs: load('faqs'), insights: load('insights'), testimonials: load('testimonials'),
    calculatorConfig: load('calculator-config'),
  };
}

describe('editorial review migration', () => {
  it('reviews every targeted record, without mutating input, and is idempotent', () => {
    const original = state();
    const before = structuredClone(original);
    const plan = buildEditorialPlan(original);
    expect(plan.skipped).toEqual([]);
    expect(new Set(plan.changes.map(c => c.id)).size).toBe(41);
    expect(original).toEqual(before);
    applyPlanInMemory(original, plan);
    expect(buildEditorialPlan(original)).toMatchObject({ changes: [], skipped: [] });
  });

  it('leaves publication, evidence, quotations, identities and article facts intact', () => {
    const original = state();
    const before = structuredClone(original);
    applyPlanInMemory(original, buildEditorialPlan(original));
    for (let i = 0; i < before.projects.length; i++) {
      for (const key of ['slug', 'publicationStatus', 'evidenceNotes', 'name', 'techStack']) {
        expect(original.projects[i][key]).toEqual(before.projects[i][key]);
      }
    }
    for (let i = 0; i < before.insights.length; i++) {
      for (const key of ['slug', 'author', 'publishedAt', 'createdAt', 'category']) {
        expect(original.insights[i][key]).toEqual(before.insights[i][key]);
      }
    }
    expect(original.testimonials).toEqual(before.testimonials);
    expect(original.about?.trackRecord).toEqual(before.about?.trackRecord);
    expect(buildEditorialPlan(before).changes.some(c => /evidence|publication|author|slug|At$/.test(c.path))).toBe(false);
  });

  it('skips the entire record after a later CMS edit', () => {
    const original = state();
    original.projects[0].solution = 'A later editorial decision';
    const plan = buildEditorialPlan(original);
    expect(plan.skipped.some(s => s.id === original.projects[0]._id)).toBe(true);
    expect(plan.changes.some(c => c.id === original.projects[0]._id)).toBe(false);
  });

  it.each(['draft', 'verified', undefined])('does not rewrite a project whose publication decision is %s', (status) => {
    const original = state();
    original.projects[0].publicationStatus = status;
    const plan = buildEditorialPlan(original);
    expect(plan.changes.some(c => c.id === original.projects[0]._id)).toBe(false);
  });

  it('changes calculator wording without changing IDs, weeks, costs or multipliers', () => {
    const original = state();
    const before = structuredClone(original.calculatorConfig);
    const plan = buildEditorialPlan(original);
    applyPlanInMemory(original, plan);
    for (const review of EDITORIAL_REVIEW.filter(r => r.collection === 'calculatorConfig')) {
      for (const path of Object.keys(review.fields)) {
        const beforeParent = getPath(before, path.split('.').slice(0, -1).join('.')) as Record<string, unknown>;
        const afterParent = getPath(original.calculatorConfig, path.split('.').slice(0, -1).join('.')) as Record<string, unknown>;
        for (const key of ['id', 'weeks', 'weeksOffset', 'costMultiplier', 'multiplier']) {
          expect(afterParent[key]).toEqual(beforeParent[key]);
        }
      }
    }
    for (const key of ['baseCost', 'features', 'rangeSpreadPct', 'roundToNearest']) {
      expect(original.calculatorConfig?.[key]).toEqual(before?.[key]);
    }
  });

  it('guards array identities and provides complete forward/rollback record guards', () => {
    const original = state();
    const plan = buildEditorialPlan(original);
    const project = plan.changes.find(c => c.collection === 'projects')!;
    expect(project.guards).toMatchObject({ publicationStatus: 'illustrative', slug: project.key });
    expect(project.rollbackGuards).toMatchObject({ publicationStatus: 'illustrative', slug: project.key, [project.path]: project.after });
    (original.calculatorConfig!.projectTypes as { id: string }[])[0].id = 'a-replaced-option';
    expect(buildEditorialPlan(original).changes.some(c => c.collection === 'calculatorConfig')).toBe(false);
  });
});
