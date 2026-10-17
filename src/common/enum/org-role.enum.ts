/**
 * Role a client user holds *within their organization* — orthogonal to the
 * platform-wide Role enum (which just says "this is a USER, i.e. a client").
 * Gates money/approval/people-management actions inside the portal:
 * CLIENT_ADMIN can pay invoices, sign contracts, approve deliverables, and
 * invite/manage other people in their org; CLIENT_VIEWER is read-only.
 */
export enum OrgRole {
  CLIENT_ADMIN = 'client_admin',
  CLIENT_VIEWER = 'client_viewer',
}
