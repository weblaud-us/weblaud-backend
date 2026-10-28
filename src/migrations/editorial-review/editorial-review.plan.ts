import { EDITORIAL_REVIEW } from './editorial-review.content';
import {
  getPath, idOf, sameValue,
  type Collection, type ContentState, type Plan,
} from '../publication-review/publication-review.plan';

export interface EditorialRecord {
  collection: Collection;
  id: string;
  key: string;
  guards: Record<string, unknown>;
  fields: Record<string, { before: unknown; after: unknown }>;
}

const fields: Partial<Record<Collection, string[]>> = {
  projects: ['description', 'solution', 'businessImpact', 'featureList'],
  services: ['title', 'description', 'features'],
  about: ['story', 'mission'],
  faqs: ['question', 'answer'],
  insights: ['title', 'summary', 'directAnswer', 'keyTakeaways', 'content'],
};

/** Text-only follow-up to the publication audit. A conflict skips the entire
 * record, including fields already at their reviewed value. No publication
 * decisions, evidence, authors, slugs, dates or calculator arithmetic change.
 */
export function buildEditorialPlan(state: ContentState): Plan {
  const plan: Plan = { changes: [], skipped: [], unchanged: 0 };
  for (const review of EDITORIAL_REVIEW) {
    const records = state[review.collection];
    const docs = Array.isArray(records) ? records : records ? [records] : [];
    const doc = docs.find((entry) => idOf(entry) === review.id);
    const skip = (reason: string, path?: string) => plan.skipped.push({
      collection: review.collection, id: review.id, key: review.key, reason, path,
    });
    if (!doc) { skip('reviewed record not found'); continue; }
    const identity = review.collection === 'projects' || review.collection === 'insights'
      ? { slug: review.key } : {};
    const guards = { ...identity, ...review.guards };
    if (Object.entries(guards).some(([path, value]) => !sameValue(getPath(doc, path), value))) {
      skip('identity or publication status changed; apply the publication audit first');
      continue;
    }
    const entries = Object.entries(review.fields);
    let conflict = false;
    for (const [path, edit] of entries) {
      const allowed = review.collection === 'calculatorConfig'
        ? /^(projectTypes\.\d+\.desc|timelineSpeeds\.\d+\.(label|desc))$/.test(path)
        : fields[review.collection]?.includes(path);
      if (!allowed) throw new Error(`Editorial migration cannot change ${review.collection}.${path}`);
      const current = getPath(doc, path);
      if (!sameValue(current, edit.before) && !sameValue(current, edit.after)) {
        skip('edited since the reviewed snapshot; entire record left unchanged', path);
        conflict = true;
      }
    }
    if (conflict) continue;
    const forwardGuards = { ...guards };
    const rollbackGuards = { ...guards };
    for (const [path, edit] of entries) {
      forwardGuards[path] = getPath(doc, path);
      rollbackGuards[path] = edit.after;
    }
    for (const [path, edit] of entries) {
      const current = getPath(doc, path);
      if (sameValue(current, edit.after)) { plan.unchanged++; continue; }
      plan.changes.push({
        collection: review.collection, id: review.id, key: review.key,
        path, before: current, after: edit.after,
        guards: forwardGuards, rollbackGuards,
      });
    }
  }
  return plan;
}
