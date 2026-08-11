/**
 * Server-side port of the calculator arithmetic in
 * weblaud-site/app/lib/calculator.ts.
 *
 * It is duplicated on purpose: submitted estimates are recomputed here from the
 * live config so a tampered payload can never dictate the price we store and
 * email. Both copies are pinned by specs asserting the same fixture outputs —
 * change one, change the other.
 */

export interface RateOptionLike {
  id: string;
  title: string;
  desc?: string;
  weeks: number;
  costMultiplier: number;
}

export interface TimelineSpeedLike {
  id: string;
  label: string;
  multiplier: number;
  desc?: string;
  weeksOffset?: number;
}

export interface CalculatorConfigLike {
  baseCost: number;
  rangeSpreadPct?: number;
  roundToNearest?: number;
  projectTypes: RateOptionLike[];
  features: RateOptionLike[];
  timelineSpeeds: TimelineSpeedLike[];
}

export interface EstimateSelection {
  projectTypeId: string;
  featureIds: string[];
  speedId: string;
}

export interface EstimateResult {
  totalWeeks: number;
  costMin: number;
  costMax: number;
  projectType?: RateOptionLike;
  features: RateOptionLike[];
  speed?: TimelineSpeedLike;
}

/**
 * Delivery window mirrored from weblaud-site/app/lib/constants.ts TIMELINE,
 * which is the single source of truth for every public timeline claim.
 */
export const TIMELINE_BOUNDS = { min: 4, max: 14 } as const;

const DEFAULT_RANGE_SPREAD_PCT = 0.28;
const DEFAULT_ROUND_TO_NEAREST = 500;

function snap(amount: number, increment: number): number {
  if (!Number.isFinite(increment) || increment <= 0) return Math.round(amount);
  return Math.round(amount / increment) * increment;
}

export function estimateProject(
  config: CalculatorConfigLike,
  selection: EstimateSelection,
): EstimateResult {
  const projectType =
    config.projectTypes.find((p) => p.id === selection.projectTypeId) ??
    config.projectTypes[0];
  const speed =
    config.timelineSpeeds.find((s) => s.id === selection.speedId) ??
    config.timelineSpeeds[0];

  // Preserve the order the admin configured them in, and drop unknown ids.
  const features = config.features.filter((f) =>
    selection.featureIds.includes(f.id),
  );

  const featureWeeks = features.reduce((acc, f) => acc + (f.weeks || 0), 0);
  const featureCostMultiplier = features.reduce(
    (acc, f) => acc + (f.costMultiplier || 0),
    0,
  );

  const rawWeeks =
    (projectType?.weeks ?? 0) + featureWeeks + (speed?.weeksOffset ?? 0);
  const totalWeeks = Math.min(
    TIMELINE_BOUNDS.max,
    Math.max(TIMELINE_BOUNDS.min, Math.round(rawWeeks * 10) / 10),
  );

  const increment = config.roundToNearest ?? DEFAULT_ROUND_TO_NEAREST;
  const spread = config.rangeSpreadPct ?? DEFAULT_RANGE_SPREAD_PCT;

  const rawCost =
    config.baseCost *
    (projectType?.costMultiplier ?? 1) *
    (1 + featureCostMultiplier) *
    (speed?.multiplier ?? 1);

  const costMin = snap(rawCost, increment);
  const costMax = snap(costMin * (1 + spread), increment);

  return { totalWeeks, costMin, costMax, projectType, features, speed };
}
