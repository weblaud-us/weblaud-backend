import { Types } from 'mongoose';

/**
 * Every place in the portal a notification, dashboard item or email can
 * point at. Notification `link` values are stored in the database and live
 * on in old emails, so the site keeps permanent redirects for any path this
 * map used to produce — change a path here, add a redirect there.
 */
export type PortalProjectSection =
  | 'overview'
  | 'tasks'
  | 'timeline'
  | 'updates'
  | 'discussion'
  | 'files'
  | 'approvals'
  | 'changes'
  | 'questions'
  | 'invoices'
  | 'contract';

/**
 * The portal's six top-level tabs (Overview, Work, Updates, Files,
 * Decisions, Billing) and their sub-pages. Pre-2026-10 links
 * (/tasks, /approvals, /change-requests, /requests, /invoices, /contract,
 * /discussion) redirect on the site — routes/portal/projects.$id.legacy.ts.
 */
const SECTION_PATHS: Record<PortalProjectSection, string> = {
  overview: '',
  tasks: '/work/tasks',
  timeline: '/work/timeline',
  updates: '/updates',
  discussion: '/updates/discussion',
  files: '/files',
  approvals: '/decisions/approvals',
  changes: '/decisions/changes',
  questions: '/decisions/questions',
  invoices: '/billing/invoices',
  contract: '/billing/contract',
};

/** Site path for one section of a project's portal workspace. */
export function portalProjectLink(
  projectId: Types.ObjectId | string,
  section: PortalProjectSection,
): string {
  return `/portal/projects/${projectId.toString()}${SECTION_PATHS[section]}`;
}

/** The project id inside a stored `/portal/projects/:id/...` link, if any. */
export function projectIdFromLink(link: string | undefined): string | null {
  const match = link?.match(/^\/portal\/projects\/([a-f0-9]{24})(?:[/?#]|$)/i);
  return match ? match[1] : null;
}
