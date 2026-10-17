import { DashboardAlertRow } from '../mail/dashboard-notifier.service';
import { HeardAbout } from './lead.constants';
import { LeadAttribution } from './schemas/lead-attribution.schema';

export const HEARD_ABOUT_LABELS: Record<HeardAbout, string> = {
  google: 'Google / search',
  ai_assistant: 'ChatGPT / AI assistant',
  clutch: 'Clutch / directory',
  linkedin: 'LinkedIn',
  referral: 'Referral',
  other: 'Other',
};

/**
 * "Source" rows for a new-lead dashboard alert. Blank values are dropped by
 * DashboardNotifierService, so a lead with no attribution adds nothing.
 */
export function sourceRows(
  attribution?: LeadAttribution,
  heardAbout?: string,
): DashboardAlertRow[] {
  const utm = [
    attribution?.utmSource,
    attribution?.utmMedium,
    attribution?.utmCampaign,
  ]
    .filter(Boolean)
    .join(' / ');

  return [
    {
      section: 'Source',
      label: 'Heard about us',
      value: heardAbout
        ? (HEARD_ABOUT_LABELS[heardAbout as HeardAbout] ?? heardAbout)
        : undefined,
    },
    { section: 'Source', label: 'Campaign', value: utm },
    { section: 'Source', label: 'Referrer', value: attribution?.referrer },
    {
      section: 'Source',
      label: 'Landing page',
      value: attribution?.landingPath,
    },
  ];
}
