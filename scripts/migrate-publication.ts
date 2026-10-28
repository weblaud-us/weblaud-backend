/**
 * Targeted content migration for the 2026-10-25 publication audit.
 *
 * Changes only the reviewed fields listed in
 * src/migrations/publication-review/publication-review.content.ts: portfolio
 * publication status, notes and illustrative copy; five CMS FAQs; the Insight
 * sentences promising a universal 4–14 week window; one calculator speed
 * description; and explicit `publicationApproved: false` on testimonials and
 * track-record entries that have no decision yet. It is NOT the broad seed
 * (scripts/migrate-content.ts) and never touches other settings.
 *
 * Talks to MongoDB directly — the Nest app (schedulers, mail) is not booted.
 *
 *   Dry run (default; writes the plan, changes nothing):
 *     pnpm migrate:publication
 *   Apply (writes rollback data before the first update):
 *     pnpm migrate:publication --apply --confirm=<database name>
 *   Roll back an applied run:
 *     pnpm migrate:publication --rollback=<…applied.json> --apply --confirm=<database name>
 *   Offline preview from a public CMS snapshot (no database):
 *     pnpm migrate:publication --snapshot=<cms dir> --snapshot-out=<dir>
 *
 * Every update is guarded: its filter includes the value the plan expects to
 * replace, so a field edited between planning and applying is reported as a
 * conflict instead of being overwritten. Rollback is guarded the same way.
 * Local runs: prefix with `node scripts/local.js` (uses .env.local).
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import { ServiceSchema } from '../src/modules/services/schemas/service.schema';
import { ProjectSchema } from '../src/modules/project/schema/project.schema';
import { FaqSchema } from '../src/modules/faq/schemas/faq.schema';
import { InsightSchema } from '../src/modules/insights/schemas/insight.schema';
import { TestimonialSchema } from '../src/modules/testimonial/schemas/testimonial.schema';
import { AboutInfoSchema } from '../src/modules/about/schemas/about-info.schema';
import { CalculatorConfigSchema } from '../src/modules/calculator-config/schemas/calculator-config.schema';
import { toPublicAbout } from '../src/modules/about/about.service';
import {
  applyPlanInMemory,
  buildPlan,
  type Change,
  type Collection,
  type ContentState,
  type Plan,
} from '../src/migrations/publication-review/publication-review.plan';
import { AUDIT_DATE } from '../src/migrations/publication-review/publication-review.content';
import { buildEditorialPlan } from '../src/migrations/editorial-review/editorial-review.plan';
import { EDITORIAL_REVIEW_ID } from '../src/migrations/editorial-review/editorial-review.content';

type Args = Record<string, string | true>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (const arg of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (match) args[match[1]] = match[2] ?? true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const editorial = args.editorial === true;
const planReview = editorial ? buildEditorialPlan : buildPlan;
const reviewId = editorial ? EDITORIAL_REVIEW_ID : AUDIT_DATE;
const OUT_DIR = path.resolve(
  typeof args.out === 'string'
    ? args.out
    : path.join(__dirname, 'output', editorial ? 'editorial-review' : 'publication-review'),
);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

function summarize(plan: Plan) {
  const byCollection = new Map<string, number>();
  for (const c of plan.changes) {
    byCollection.set(c.collection, (byCollection.get(c.collection) ?? 0) + 1);
  }
  console.log(
    `\nChanges: ${plan.changes.length}  Unchanged: ${plan.unchanged}  Skipped: ${plan.skipped.length}`,
  );
  for (const [collection, count] of byCollection)
    console.log(`  ${collection}: ${count}`);
  for (const c of plan.changes) {
    const show = (v: unknown) => {
      const text = v === undefined ? '(absent)' : JSON.stringify(v);
      return text.length > 110 ? `${text.slice(0, 107)}...` : text;
    };
    console.log(
      `\n  [${c.collection}] ${c.key} :: ${c.path}\n    - ${show(c.before)}\n    + ${show(c.after)}`,
    );
  }
  if (plan.skipped.length) {
    console.log('\nSkipped:');
    for (const s of plan.skipped) {
      console.log(
        `  [${s.collection}] ${s.key}${s.path ? ` :: ${s.path}` : ''} — ${s.reason}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Offline snapshot mode
// ---------------------------------------------------------------------------

const SNAPSHOT_FILES: Record<string, keyof ContentState | null> = {
  'projects.json': 'projects',
  'services.json': 'services',
  'faqs.json': 'faqs',
  'insights.json': 'insights',
  'testimonials.json': 'testimonials',
  'about.json': 'about',
  'calculator-config.json': 'calculatorConfig',
};

function runSnapshot(inDir: string, outDir: string) {
  const envelopes: Record<string, { data: unknown }> = {};
  for (const file of fs.readdirSync(inDir).filter((f) => f.endsWith('.json'))) {
    envelopes[file] = JSON.parse(
      fs.readFileSync(path.join(inDir, file), 'utf8'),
    );
  }
  const state = {} as ContentState;
  for (const [file, key] of Object.entries(SNAPSHOT_FILES)) {
    if (key)
      (state as unknown as Record<string, unknown>)[key] = structuredClone(
        envelopes[file]?.data ??
          (key === 'about' || key === 'calculatorConfig' ? null : []),
      );
  }

  const plan = planReview(state);
  summarize(plan);
  applyPlanInMemory(state, plan);

  // Shape each collection the way the public API now returns it.
  const publicData: Record<string, unknown> = {
    'projects.json': state.projects
      .filter(
        (p) =>
          p.publicationStatus === 'illustrative' ||
          p.publicationStatus === 'verified',
      )
      .map(({ evidenceNotes: _notes, ...p }) => p),
    'testimonials.json': state.testimonials
      .filter((t) => t.isActive !== false && t.publicationApproved === true)
      .map(({ evidenceNote: _note, ...t }) => t),
    'about.json': state.about ? toPublicAbout(state.about as never) : null,
    'faqs.json': state.faqs,
    'services.json': state.services,
    'insights.json': state.insights,
    'calculator-config.json': state.calculatorConfig,
  };

  fs.mkdirSync(path.join(outDir, 'cms'), { recursive: true });
  for (const [file, envelope] of Object.entries(envelopes)) {
    const data = file in publicData ? publicData[file] : envelope.data;
    writeJson(path.join(outDir, 'cms', file), { ...envelope, data });
  }
  writeJson(path.join(outDir, 'dry-run.json'), {
    audit: reviewId,
    source: inDir,
    ...plan,
  });
  console.log(`\nWrote public-shaped snapshot and dry-run plan to ${outDir}`);
}

// ---------------------------------------------------------------------------
// Database mode
// ---------------------------------------------------------------------------

function loadEnv() {
  if (process.env.MONGODB_URI) return;
  const file = path.resolve(__dirname, '..', process.env.ENV_FILE || '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

function models() {
  // Throwaway models only to resolve each collection's name exactly as Nest
  // registers it; documents are read and written through the raw driver so
  // schema defaults never leak into the "before" values.
  const make = (name: string, schema: mongoose.Schema) =>
    mongoose.models[name] ?? mongoose.model(name, schema);
  return {
    projects: make('Project', ProjectSchema).collection,
    services: make('Service', ServiceSchema).collection,
    faqs: make('Faq', FaqSchema).collection,
    insights: make('Insight', InsightSchema).collection,
    testimonials: make('Testimonial', TestimonialSchema).collection,
    about: make('AboutInfo', AboutInfoSchema).collection,
    calculatorConfig: make('CalculatorConfig', CalculatorConfigSchema)
      .collection,
  } satisfies Record<Collection, unknown>;
}

const toId = (id: string) =>
  mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;

/** Matches a field holding `value`, treating `undefined` as "absent". */
function guard(changePath: string, value: unknown) {
  return value === undefined || value === null
    ? { [changePath]: { $in: [null] } }
    : { [changePath]: value };
}

async function applyChanges(changes: Change[], direction: 'forward' | 'back') {
  const cols = models();
  const applied: Change[] = [];
  const conflicts: (Change & { reason: string })[] = [];
  const groups = new Map<string, Change[]>();
  for (const change of changes) {
    const key = `${change.collection}:${change.id}`;
    groups.set(key, [...(groups.get(key) ?? []), change]);
  }
  for (const group of groups.values()) {
    const filter: Record<string, unknown> = { _id: toId(group[0].id) };
    const set: Record<string, unknown> = {};
    const unset: Record<string, string> = {};
    for (const change of group) {
      const extraGuards = direction === 'forward' ? change.guards : change.rollbackGuards;
      if (extraGuards) {
        for (const [field, value] of Object.entries(extraGuards)) {
          Object.assign(filter, guard(field, value));
        }
      }
      const from = direction === 'forward' ? change.before : change.after;
      const to = direction === 'forward' ? change.after : change.before;
      Object.assign(filter, guard(change.path, from));
      if (to === undefined) unset[change.path] = '';
      else set[change.path] = to;
    }
    // Copy and publication decision commit together, or neither does.
    const result = await cols[group[0].collection].updateOne(filter as never, {
      ...(Object.keys(set).length ? { $set: set } : {}),
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    });
    if (result.matchedCount === 1) applied.push(...group);
    else conflicts.push(...group.map(change => ({ ...change, reason: 'record no longer holds the reviewed values; entire record left unchanged' })));
  }
  return { applied, conflicts };
}

async function readState(): Promise<ContentState> {
  const cols = models();
  const all = (c: Collection) =>
    cols[c].find({}).toArray() as Promise<ContentState['projects']>;
  return {
    projects: await all('projects'),
    services: await all('services'),
    faqs: await all('faqs'),
    insights: await all('insights'),
    testimonials: await all('testimonials'),
    about: ((await cols.about.findOne({})) as ContentState['about']) ?? null,
    calculatorConfig:
      ((await cols.calculatorConfig.findOne(
        {},
      )) as ContentState['calculatorConfig']) ?? null,
  };
}

async function runDatabase() {
  loadEnv();
  const uri = process.env.MONGODB_URI;
  if (!uri)
    throw new Error('MONGODB_URI is not set (or ENV_FILE does not define it)');

  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  const host = mongoose.connection.host;
  const target = `${host}/${db.databaseName}`;
  console.log(`Target: ${target}`);

  const writing = args.apply === true;
  if (writing && args.confirm !== db.databaseName) {
    throw new Error(
      `Refusing to write: pass --confirm=${db.databaseName} to confirm the target database (${target}).`,
    );
  }

  try {
    if (typeof args.rollback === 'string') {
      const record = JSON.parse(fs.readFileSync(args.rollback, 'utf8')) as {
        applied: Change[];
      };
      const reversed = [...record.applied].reverse();
      console.log(
        `Rollback of ${reversed.length} applied change(s) from ${args.rollback}`,
      );
      if (!writing) {
        console.log('Dry run — add --apply --confirm=<db> to restore.');
        return;
      }
      const result = await applyChanges(reversed, 'back');
      const file = writeJson(
        path.join(OUT_DIR, `${stamp}.rollback-result.json`),
        { target, ...result },
      );
      console.log(
        `Restored ${result.applied.length}; conflicts ${result.conflicts.length}. Result: ${file}`,
      );
      return;
    }

    const plan = planReview(await readState());
    summarize(plan);
    const planFile = writeJson(path.join(OUT_DIR, `${stamp}.plan.json`), {
      audit: reviewId,
      target,
      ...plan,
    });
    console.log(`\nPlan: ${planFile}`);
    if (!writing) {
      console.log(
        'Dry run — nothing written. Re-run with --apply --confirm=<db> to apply.',
      );
      return;
    }

    // Rollback data first: if the process dies mid-run, the record of what
    // it intended (with every before value) is already on disk.
    const appliedFile = path.join(OUT_DIR, `${stamp}.applied.json`);
    writeJson(appliedFile, {
      audit: reviewId,
      target,
      status: 'in-progress',
      applied: plan.changes,
    });
    const result = await applyChanges(plan.changes, 'forward');
    writeJson(appliedFile, {
      audit: reviewId,
      target,
      status: 'complete',
      ...result,
    });
    console.log(
      `\nApplied ${result.applied.length}; conflicts ${result.conflicts.length}. Rollback data: ${appliedFile}`,
    );
    console.log(
      'Public pages cache for up to an hour (s-maxage=3600); purge the CDN/site cache after applying.',
    );
  } finally {
    await mongoose.disconnect();
  }
}

async function main() {
  if (typeof args.snapshot === 'string') {
    const out =
      typeof args['snapshot-out'] === 'string'
        ? args['snapshot-out']
        : path.join(OUT_DIR, `${stamp}-snapshot`);
    runSnapshot(path.resolve(args.snapshot), path.resolve(out));
    return;
  }
  await runDatabase();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
