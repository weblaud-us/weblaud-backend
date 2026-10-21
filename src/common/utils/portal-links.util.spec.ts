import { portalProjectLink, projectIdFromLink } from './portal-links.util';

const ID = '507f1f77bcf86cd799439011';

describe('portalProjectLink', () => {
  it('builds the tab paths the site routes', () => {
    expect(portalProjectLink(ID, 'overview')).toBe(`/portal/projects/${ID}`);
    expect(portalProjectLink(ID, 'tasks')).toBe(`/portal/projects/${ID}/work/tasks`);
    expect(portalProjectLink(ID, 'discussion')).toBe(`/portal/projects/${ID}/discussion`);
    expect(portalProjectLink(ID, 'activity')).toBe(`/portal/projects/${ID}/activity`);
    expect(portalProjectLink(ID, 'changes')).toBe(`/portal/projects/${ID}/decisions/change-requests`);
    expect(portalProjectLink(ID, 'questions')).toBe(`/portal/projects/${ID}/decisions/questions`);
    expect(portalProjectLink(ID, 'invoices')).toBe(`/portal/projects/${ID}/billing/invoices`);
    expect(portalProjectLink(ID, 'contract')).toBe(`/portal/projects/${ID}/billing/contract`);
    expect(portalProjectLink(ID, 'files')).toBe(`/portal/projects/${ID}/files`);
  });
});

describe('projectIdFromLink', () => {
  it('reads the project id from new and pre-redesign links', () => {
    expect(projectIdFromLink(`/portal/projects/${ID}/work/tasks`)).toBe(ID);
    expect(projectIdFromLink(`/portal/projects/${ID}/tasks`)).toBe(ID);
    expect(projectIdFromLink(`/portal/projects/${ID}`)).toBe(ID);
    expect(projectIdFromLink(`/portal/projects/${ID}?tab=x`)).toBe(ID);
  });

  it('returns null for anything else', () => {
    expect(projectIdFromLink(undefined)).toBeNull();
    expect(projectIdFromLink(`/portal/invoices/${ID}`)).toBeNull();
    expect(projectIdFromLink('/portal/projects/not-an-id/tasks')).toBeNull();
  });
});
