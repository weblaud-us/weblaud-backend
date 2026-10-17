/**
 * Sales-pipeline stages shared by every lead source (contact messages and
 * calculator estimates). Separate from each record's inbox `status`
 * (new/read/spam), which only tracks whether an admin has looked at it.
 */
export const LEAD_STAGES = [
  'new',
  'contacted',
  'call_booked',
  'proposal_sent',
  'won',
  'lost',
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];

/** Stages that still need someone to act — everything but a closed deal. */
export const OPEN_LEAD_STAGES: LeadStage[] = [
  'new',
  'contacted',
  'call_booked',
  'proposal_sent',
];

/**
 * Self-reported "How did you hear about us?" answers. `ai_assistant` is the
 * one that measures whether the GEO/llms.txt work is producing clients — UTM
 * tags can't, since ChatGPT and friends rarely pass a referrer.
 */
export const HEARD_ABOUT_OPTIONS = [
  'google',
  'ai_assistant',
  'clutch',
  'linkedin',
  'referral',
  'other',
] as const;

export type HeardAbout = (typeof HEARD_ABOUT_OPTIONS)[number];

/**
 * Optional qualifiers on the contact form, so an admin can tell a $20k build
 * from a tyre-kicker before replying. Values must match BUDGET_OPTIONS /
 * TIMELINE_OPTIONS in the site's app/lib/leads.ts — the API rejects anything
 * else. The bands start at our minimum sprint fee ($4,500).
 */
export const BUDGET_OPTIONS = [
  'under_5k',
  '5k_10k',
  '10k_20k',
  '20k_plus',
  'not_sure',
] as const;

export const BUDGET_LABELS: Record<(typeof BUDGET_OPTIONS)[number], string> = {
  under_5k: 'Under $5k',
  '5k_10k': '$5k – $10k',
  '10k_20k': '$10k – $20k',
  '20k_plus': '$20k+',
  not_sure: 'Not sure yet',
};

export const TIMELINE_OPTIONS = [
  'asap',
  '1_3_months',
  '3_6_months',
  'exploring',
] as const;

export const TIMELINE_LABELS: Record<
  (typeof TIMELINE_OPTIONS)[number],
  string
> = {
  asap: 'As soon as possible',
  '1_3_months': 'Within 1–3 months',
  '3_6_months': 'In 3–6 months',
  exploring: 'Just exploring',
};

/**
 * Records created before the pipeline existed have no `stage` at all; they
 * count as `new`. `null` in a Mongo filter matches a missing field.
 */
export function stageFilter(stage: string) {
  return stage === 'new' ? { stage: { $in: ['new', null] } } : { stage };
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A `new` lead this old with no follow-up date set counts as unanswered. */
const UNANSWERED_AFTER_MS = DAY_MS;
/**
 * …but only up to this age. Leads from before the pipeline existed have no
 * stage at all (they read as `new`); without a cutoff every lead ever
 * received would show as needing a follow-up.
 */
export const UNANSWERED_LOOKBACK_MS = 14 * DAY_MS;

/**
 * "Needs a human now": open leads whose follow-up date has arrived, plus
 * `new` ones with no follow-up date that have waited more than a day. Shared
 * by the daily digest and the dashboard count so the two always agree.
 * `$nin` and `$in: [.., null]` both match records with no `stage` field.
 */
export function followUpDueFilter(now: Date) {
  return {
    stage: { $nin: ['won', 'lost'] },
    $or: [
      { nextFollowUpAt: { $lte: now } },
      {
        stage: { $in: ['new', null] },
        nextFollowUpAt: { $exists: false },
        createdAt: {
          $lte: new Date(now.getTime() - UNANSWERED_AFTER_MS),
          $gte: new Date(now.getTime() - UNANSWERED_LOOKBACK_MS),
        },
      },
    ],
  };
}
