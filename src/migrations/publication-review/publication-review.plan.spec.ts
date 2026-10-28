import {
  CALCULATOR_REVIEW,
  FAQ_REVIEW,
  INSIGHT_REVIEW,
  PROJECT_REVIEW,
} from './publication-review.content';
import {
  applyPlanInMemory,
  buildPlan,
  getPath,
  setPath,
  type ContentState,
} from './publication-review.plan';

/** Documents as they stood in the reviewed snapshot. */
function snapshotState(): ContentState {
  const projects = PROJECT_REVIEW.map((entry, i) => {
    const doc: Record<string, unknown> = { _id: `p${i}`, slug: entry.slug };
    for (const [field, edit] of Object.entries(entry.fields)) {
      doc[field] = structuredClone(edit.before);
    }
    return doc as ContentState['projects'][number];
  });
  const faqs = FAQ_REVIEW.map((entry, i) => ({
    _id: `f${i}`,
    question: entry.question,
    answer: entry.fields.answer.before,
  }));
  const insights: ContentState['insights'] = [];
  for (const edit of INSIGHT_REVIEW) {
    let doc = insights.find((d) => d.slug === edit.slug);
    if (!doc) {
      doc = {
        _id: `i${insights.length}`,
        slug: edit.slug,
        keyTakeaways: [''],
        content: [
          { heading: '', text: '' },
          { heading: '', text: '' },
          { heading: '', text: '' },
        ],
      };
      insights.push(doc);
    }
    const current = (getPath(doc, edit.field) as string | undefined) ?? '';
    setPath(doc, edit.field, `${current} ${edit.before}`.trim());
  }
  return {
    projects,
    faqs,
    insights,
    testimonials: [
      { _id: 't1', authorName: 'A', quote: 'q' },
      { _id: 't2', authorName: 'B', quote: 'q', publicationApproved: true },
    ],
    about: {
      _id: 'a1',
      trackRecord: [{ title: '75+', subtitle: 'Projects Delivered' }],
    },
    calculatorConfig: {
      _id: 'c1',
      baseCost: 4500,
      timelineSpeeds: [
        { id: 'standard', desc: CALCULATOR_REVIEW[0].before, multiplier: 1 },
        { id: 'expedited', desc: 'Faster', multiplier: 1.25 },
      ],
    },
  };
}

describe('publication review plan', () => {
  it('plans every reviewed change from the snapshot, with nothing skipped', () => {
    const plan = buildPlan(snapshotState());

    expect(plan.skipped).toEqual([]);
    const statuses = plan.changes.filter((c) => c.path === 'publicationStatus');
    expect(statuses).toHaveLength(PROJECT_REVIEW.length);
    expect(statuses.filter((c) => c.after === 'illustrative')).toHaveLength(6);
    expect(statuses.every((c) => c.before === undefined)).toBe(true);
  });

  it('is idempotent: re-planning after applying changes nothing', () => {
    const state = snapshotState();
    applyPlanInMemory(state, buildPlan(state));

    const again = buildPlan(state);
    expect(again.changes).toEqual([]);
    expect(again.skipped).toEqual([]);
  });

  it('removes every 14-week and price-ceiling phrase it targets', () => {
    const state = snapshotState();
    applyPlanInMemory(state, buildPlan(state));

    const text = JSON.stringify([
      state.faqs,
      state.insights,
      state.calculatorConfig,
    ]);
    expect(text).not.toMatch(/14[- ]weeks?|4[- ]to[- ]14|4–14|\$18,500|99\.9%/);
  });

  it('removes outcome figures from published examples but keeps their slugs', () => {
    const state = snapshotState();
    applyPlanInMemory(state, buildPlan(state));

    const published = state.projects.filter(
      (p) => p.publicationStatus === 'illustrative',
    );
    for (const project of published) {
      expect(project.businessImpact).not.toMatch(/\d+\s?%|\d+x\b/);
      expect(PROJECT_REVIEW.map((r) => r.slug)).toContain(project.slug);
    }
  });

  it('skips a field an admin edited after the snapshot', () => {
    const state = snapshotState();
    state.faqs[0].answer = 'Rewritten by an admin.';

    const plan = buildPlan(state);
    expect(plan.changes.find((c) => c.id === 'f0')).toBeUndefined();
    expect(plan.skipped).toEqual([
      expect.objectContaining({ id: 'f0', path: 'answer' }),
    ]);
  });

  it('never touches a verified study or an existing approval', () => {
    const state = snapshotState();
    state.projects[0].publicationStatus = 'verified';

    const plan = buildPlan(state);
    expect(plan.changes.some((c) => c.id === 'p0')).toBe(false);
    expect(plan.changes.some((c) => c.id === 't2')).toBe(false);
    expect(plan.changes).toContainEqual(
      expect.objectContaining({
        id: 't1',
        path: 'publicationApproved',
        after: false,
      }),
    );
  });

  it('leaves an entire project unpublished when any reviewed field has changed', () => {
    const state = snapshotState();
    state.projects[0].businessImpact = 'New, unreviewed outcome claim';
    const plan = buildPlan(state);
    expect(plan.changes.some(c => c.id === 'p0')).toBe(false);
    expect(plan.skipped).toContainEqual(expect.objectContaining({ id: 'p0', path: 'businessImpact' }));
  });

  it('guards the complete reviewed project when publishing, including fields already rewritten', () => {
    const state = snapshotState();
    const [field, edit] = Object.entries(PROJECT_REVIEW[0].fields)[0];
    state.projects[0][field] = edit.after;
    const changes = buildPlan(state).changes.filter(c => c.id === 'p0');
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.every(c => c.guards?.[field] === edit.after)).toBe(true);
  });

  it('changes only the calculator description, never its cost assumptions', () => {
    const plan = buildPlan(snapshotState());

    expect(
      plan.changes.filter((c) => c.collection === 'calculatorConfig'),
    ).toEqual([expect.objectContaining({ path: 'timelineSpeeds.0.desc' })]);
  });

  it('reports projects outside the review instead of changing them', () => {
    const state = snapshotState();
    state.projects.push({ _id: 'new', slug: 'added-later' });

    const plan = buildPlan(state);
    expect(plan.changes.some((c) => c.id === 'new')).toBe(false);
    expect(plan.skipped).toContainEqual(
      expect.objectContaining({ key: 'added-later' }),
    );
  });
});
