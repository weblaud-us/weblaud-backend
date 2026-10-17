import type {
  AuditIssue,
  AuditScores,
  AuditVitals,
} from './schemas/audit.schema';

/** The parts of a PageSpeed Insights v5 response this module reads. */
export interface PsiResponse {
  lighthouseResult?: {
    finalDisplayedUrl?: string;
    runtimeError?: { code?: string; message?: string };
    categories?: Record<
      string,
      {
        score: number | null;
        auditRefs?: { id: string; weight?: number; group?: string }[];
      }
    >;
    audits?: Record<
      string,
      {
        id: string;
        title: string;
        score: number | null;
        scoreDisplayMode?: string;
        displayValue?: string;
        numericValue?: number;
        details?: { type?: string; overallSavingsMs?: number };
        metricSavings?: Record<string, number | undefined>;
      }
    >;
  };
}

export interface MappedAudit {
  scores: AuditScores;
  vitals: AuditVitals;
  issues: AuditIssue[];
}

const MAX_ISSUES = 20;
/** Below this an audit counts as an issue — Lighthouse's own "passed" line. */
const PASS_SCORE = 0.9;
/** Score modes that mean "this audit graded the page", vs. info-only rows. */
const GRADED_MODES = new Set(['numeric', 'binary', 'metricSavings']);

const CATEGORY_KEYS: Record<keyof AuditScores, string> = {
  performance: 'performance',
  seo: 'seo',
  accessibility: 'accessibility',
  bestPractices: 'best-practices',
};

/**
 * Lighthouse JSON → what we store and email. Pure, so it's tested against a
 * fixture rather than the live API.
 *
 * Issues: every graded audit under PASS_SCORE in any of the four categories,
 * excluding the raw metric rows (LCP itself isn't a fix, "reduce unused JS"
 * is). Performance issues with an estimated time saving come first, biggest
 * saving first; the rest follow by Lighthouse's own weighting.
 */
export function mapLighthouseResult(psi: PsiResponse): MappedAudit {
  const lr = psi.lighthouseResult;
  const categories = lr?.categories;
  const audits = lr?.audits ?? {};
  if (!categories) throw new Error('PageSpeed response had no categories');

  const score = (key: string) => {
    const value = categories[key]?.score;
    return typeof value === 'number' ? Math.round(value * 100) : 0;
  };
  const scores = Object.fromEntries(
    Object.entries(CATEGORY_KEYS).map(([field, key]) => [field, score(key)]),
  ) as unknown as AuditScores;

  const numeric = (id: string) => {
    const value = audits[id]?.numericValue;
    return typeof value === 'number' ? value : undefined;
  };
  const vitals: AuditVitals = {
    lcpMs: round(numeric('largest-contentful-paint')),
    cls: round(numeric('cumulative-layout-shift'), 3),
    tbtMs: round(numeric('total-blocking-time')),
    fcpMs: round(numeric('first-contentful-paint')),
  };

  const seen = new Set<string>();
  const ranked: (AuditIssue & { weight: number })[] = [];
  for (const [field, key] of Object.entries(CATEGORY_KEYS)) {
    for (const ref of categories[key]?.auditRefs ?? []) {
      if (ref.group === 'metrics' || seen.has(ref.id)) continue;
      const audit = audits[ref.id];
      if (
        !audit ||
        audit.score === null ||
        audit.score >= PASS_SCORE ||
        !GRADED_MODES.has(audit.scoreDisplayMode ?? '')
      ) {
        continue;
      }
      seen.add(ref.id);
      const savings =
        audit.details?.overallSavingsMs ??
        Math.max(
          0,
          ...['LCP', 'FCP', 'TBT'].map((m) => audit.metricSavings?.[m] ?? 0),
        );
      ranked.push({
        id: audit.id,
        title: audit.title,
        displayValue: audit.displayValue || undefined,
        savingsMs: savings > 0 ? Math.round(savings) : undefined,
        category: field,
        weight: ref.weight ?? 0,
      });
    }
  }

  ranked.sort(
    (a, b) =>
      (b.savingsMs ?? 0) - (a.savingsMs ?? 0) ||
      b.weight - a.weight ||
      a.title.localeCompare(b.title),
  );

  return {
    scores,
    vitals,
    issues: ranked.slice(0, MAX_ISSUES).map((issue) => ({
      id: issue.id,
      title: issue.title,
      displayValue: issue.displayValue,
      savingsMs: issue.savingsMs,
      category: issue.category,
    })),
  };
}

function round(value: number | undefined, digits = 0) {
  if (value === undefined) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
