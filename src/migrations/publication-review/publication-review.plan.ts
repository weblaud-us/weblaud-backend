import {
  CALCULATOR_REVIEW,
  FAQ_REVIEW,
  INSIGHT_REVIEW,
  PROJECT_REVIEW,
  SERVICE_REVIEW,
  type CalculatorTextEdit,
  type FaqReview,
  type ProjectReview,
  type TextEdit,
} from './publication-review.content';

/**
 * Pure planning for the publication-audit content migration. Given the
 * current documents, it decides which fields to change and records the exact
 * before/after value of each, so the runner can apply them with a guarded
 * update (the filter includes the expected `before`) and a rollback can
 * restore them the same way. Nothing here touches a database.
 *
 * Idempotent: a field already at its reviewed value is "unchanged". A field
 * that matches neither the reviewed `before` nor `after` was edited after the
 * snapshot, and is skipped rather than overwritten.
 */

export type Collection =
  | 'services'
  | 'projects'
  | 'faqs'
  | 'insights'
  | 'testimonials'
  | 'about'
  | 'calculatorConfig';

export interface Change {
  collection: Collection;
  id: string;
  /** Human-readable record key: slug, question, author name… */
  key: string;
  /** Mongo dot path of the field. */
  path: string;
  /** `undefined` means the field was absent. */
  before: unknown;
  after: unknown;
  /** Reviewed project fields that must still match when publishing atomically. */
  guards?: Record<string, unknown>;
  /** Optional stable identities and reviewed values required during rollback. */
  rollbackGuards?: Record<string, unknown>;
}

export interface Skip {
  collection: Collection;
  id?: string;
  key: string;
  path?: string;
  reason: string;
}

export interface Plan {
  changes: Change[];
  skipped: Skip[];
  /** Fields already at their reviewed value. */
  unchanged: number;
}

export interface ContentState {
  projects: Doc[];
  services?: Doc[];
  faqs: Doc[];
  insights: Doc[];
  testimonials: Doc[];
  about: Doc | null;
  calculatorConfig: Doc | null;
}

type Doc = Record<string, unknown> & { _id: unknown };

export function idOf(doc: Doc): string {
  return String(doc._id);
}

export function getPath(doc: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        value == null ? undefined : (value as Record<string, unknown>)[key],
      doc,
    );
}

export function setPath(doc: unknown, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  const parent = keys.reduce<Record<string, unknown>>(
    (node, key) => node[key] as Record<string, unknown>,
    doc as Record<string, unknown>,
  );
  if (value === undefined) delete parent[last];
  else parent[last] = value;
}

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

class PlanBuilder {
  readonly plan: Plan = { changes: [], skipped: [], unchanged: 0 };

  /** Guarded edit: apply only from the reviewed `before`. */
  edit(
    collection: Collection,
    doc: Doc,
    key: string,
    path: string,
    before: unknown,
    after: unknown,
  ) {
    const current = getPath(doc, path);
    if (sameValue(current, after)) {
      this.plan.unchanged += 1;
    } else if (sameValue(current, before)) {
      this.plan.changes.push({
        collection,
        id: idOf(doc),
        key,
        path,
        before: current,
        after,
      });
    } else {
      this.skip(
        collection,
        key,
        'edited since the reviewed snapshot',
        doc,
        path,
      );
    }
  }

  /** Sets a field only when it is absent (never replaces a decision). */
  fillIfMissing(
    collection: Collection,
    doc: Doc,
    key: string,
    path: string,
    value: unknown,
  ) {
    const current = getPath(doc, path);
    if (current === undefined || current === null || current === '') {
      this.plan.changes.push({
        collection,
        id: idOf(doc),
        key,
        path,
        before: current,
        after: value,
      });
    } else if (sameValue(current, value)) {
      this.plan.unchanged += 1;
    } else {
      this.skip(collection, key, 'already set; left as is', doc, path);
    }
  }

  skip(
    collection: Collection,
    key: string,
    reason: string,
    doc?: Doc,
    path?: string,
  ) {
    this.plan.skipped.push({
      collection,
      ...(doc ? { id: idOf(doc) } : {}),
      key,
      ...(path ? { path } : {}),
      reason,
    });
  }
}

function planProjects(
  b: PlanBuilder,
  projects: Doc[],
  review: ProjectReview[],
) {
  const bySlug = new Map(projects.map((p) => [String(p.slug), p]));
  for (const entry of review) {
    const doc = bySlug.get(entry.slug);
    if (!doc) {
      b.skip('projects', entry.slug, 'not found');
      continue;
    }
    const status = doc.publicationStatus as string | undefined;
    if (status === 'verified') {
      // Someone recorded evidence and published it as verified; that
      // decision outranks this audit.
      b.skip('projects', entry.slug, 'already verified; left as is', doc);
      continue;
    }
    // A partial rewrite must never publish remaining unreviewed claims.
    const conflicts = Object.entries(entry.fields).filter(([field, edit]) => {
      const value = getPath(doc, field);
      return !sameValue(value, edit.before) && !sameValue(value, edit.after);
    });
    if (conflicts.length) {
      for (const [field] of conflicts) {
        b.skip('projects', entry.slug, 'project edited since review; entire record left unchanged', doc, field);
      }
      continue;
    }
    const firstChange = b.plan.changes.length;
    for (const [field, edit] of Object.entries(entry.fields)) {
      b.edit('projects', doc, entry.slug, field, edit.before, edit.after);
    }
    if (status === undefined || status === null) {
      b.plan.changes.push({
        collection: 'projects',
        id: idOf(doc),
        key: entry.slug,
        path: 'publicationStatus',
        before: status,
        after: entry.publicationStatus,
      });
    } else if (status === entry.publicationStatus) {
      b.plan.unchanged += 1;
    } else {
      b.skip(
        'projects',
        entry.slug,
        `status already "${status}"; left as is`,
        doc,
        'publicationStatus',
      );
    }
    b.fillIfMissing(
      'projects',
      doc,
      entry.slug,
      'evidenceNotes',
      entry.evidenceNotes,
    );
    const guards = Object.fromEntries(
      [...Object.keys(entry.fields), 'publicationStatus'].map(field => [field, getPath(doc, field)]),
    );
    for (const change of b.plan.changes.slice(firstChange)) change.guards = guards;
  }
  const reviewed = new Set(review.map((r) => r.slug));
  for (const doc of projects) {
    const slug = String(doc.slug);
    if (!reviewed.has(slug)) {
      const status =
        (doc.publicationStatus as string | undefined) ??
        'unset (reads as draft)';
      b.skip(
        'projects',
        slug,
        `not in the reviewed snapshot; left as is (status: ${status})`,
        doc,
      );
    }
  }
}

function planFaqs(b: PlanBuilder, faqs: Doc[], review: FaqReview[]) {
  for (const entry of review) {
    // Match on the reviewed question or, after a re-run, the new one.
    const doc = faqs.find(
      (f) =>
        f.question === entry.question ||
        f.question === entry.fields.question?.after,
    );
    if (!doc) {
      b.skip('faqs', entry.question, 'not found');
      continue;
    }
    for (const [field, edit] of Object.entries(entry.fields)) {
      b.edit('faqs', doc, entry.question, field, edit.before, edit.after);
    }
  }
}

function planInsights(b: PlanBuilder, insights: Doc[], review: TextEdit[]) {
  // Several edits can target one field; apply them in order to a working
  // value so the recorded before/after covers the whole field once.
  const pending = new Map<
    string,
    { doc: Doc; path: string; key: string; before: string; after: string }
  >();
  for (const edit of review) {
    const doc = insights.find((i) => i.slug === edit.slug);
    if (!doc) {
      b.skip('insights', edit.slug, 'not found');
      continue;
    }
    const mapKey = `${idOf(doc)}:${edit.field}`;
    const original = getPath(doc, edit.field);
    const entry = pending.get(mapKey) ?? {
      doc,
      path: edit.field,
      key: edit.slug,
      before: typeof original === 'string' ? original : '',
      after: typeof original === 'string' ? original : '',
    };
    if (typeof original !== 'string') {
      b.skip('insights', edit.slug, 'field is not text', doc, edit.field);
      continue;
    }
    if (entry.after.includes(edit.before)) {
      entry.after = entry.after.replace(edit.before, edit.after);
      pending.set(mapKey, entry);
    } else if (entry.after.includes(edit.after)) {
      b.plan.unchanged += 1;
    } else {
      b.skip(
        'insights',
        edit.slug,
        'edited since the reviewed snapshot',
        doc,
        edit.field,
      );
    }
  }
  for (const entry of pending.values()) {
    if (entry.after !== entry.before) {
      b.plan.changes.push({
        collection: 'insights',
        id: idOf(entry.doc),
        key: entry.key,
        path: entry.path,
        before: entry.before,
        after: entry.after,
      });
    }
  }
}

function planCalculator(
  b: PlanBuilder,
  config: Doc | null,
  review: CalculatorTextEdit[],
) {
  if (!config) return;
  const speeds = (config.timelineSpeeds as { id: string }[] | undefined) ?? [];
  for (const edit of review) {
    const index = speeds.findIndex((s) => s.id === edit.speedId);
    if (index < 0) {
      b.skip('calculatorConfig', edit.speedId, 'speed not found', config);
      continue;
    }
    // Only this description changes. Cost assumptions, weeks and every other
    // setting are left exactly as configured.
    b.edit(
      'calculatorConfig',
      config,
      `timelineSpeeds.${edit.speedId}`,
      `timelineSpeeds.${index}.${edit.field}`,
      edit.before,
      edit.after,
    );
  }
}

/**
 * Makes the default explicit in the CMS: unapproved until someone records
 * evidence and approves. An existing `true` is a deliberate decision and is
 * never changed.
 */
function planApprovals(b: PlanBuilder, state: ContentState) {
  for (const doc of state.testimonials) {
    if (doc.publicationApproved === undefined) {
      b.plan.changes.push({
        collection: 'testimonials',
        id: idOf(doc),
        key: String(doc.authorName),
        path: 'publicationApproved',
        before: undefined,
        after: false,
      });
    } else {
      b.plan.unchanged += 1;
    }
  }
  const entries = (state.about?.trackRecord as Doc[] | undefined) ?? [];
  entries.forEach((entry, index) => {
    if (entry.publicationApproved === undefined) {
      b.plan.changes.push({
        collection: 'about',
        id: idOf(state.about!),
        key: `${String(entry.title)} ${String(entry.subtitle)}`,
        path: `trackRecord.${index}.publicationApproved`,
        before: undefined,
        after: false,
      });
    } else {
      b.plan.unchanged += 1;
    }
  });
}

export function buildPlan(state: ContentState): Plan {
  const b = new PlanBuilder();
  planProjects(b, state.projects, PROJECT_REVIEW);
  for (const entry of SERVICE_REVIEW) {
    const doc = (state.services ?? []).find(service => service.title === entry.title);
    if (!doc) continue;
    for (const [field, edit] of Object.entries(entry.fields)) {
      b.edit('services', doc, entry.title, field, edit.before, edit.after);
    }
  }
  planFaqs(b, state.faqs, FAQ_REVIEW);
  planInsights(b, state.insights, INSIGHT_REVIEW);
  planCalculator(b, state.calculatorConfig, CALCULATOR_REVIEW);
  planApprovals(b, state);
  return b.plan;
}

/** Applies a plan to in-memory documents (used for snapshot previews). */
export function applyPlanInMemory(state: ContentState, plan: Plan) {
  const lookup: Record<Collection, Doc[]> = {
    projects: state.projects,
    services: state.services ?? [],
    faqs: state.faqs,
    insights: state.insights,
    testimonials: state.testimonials,
    about: state.about ? [state.about] : [],
    calculatorConfig: state.calculatorConfig ? [state.calculatorConfig] : [],
  };
  for (const change of plan.changes) {
    const doc = lookup[change.collection].find((d) => idOf(d) === change.id);
    if (doc) setPath(doc, change.path, change.after);
  }
}
