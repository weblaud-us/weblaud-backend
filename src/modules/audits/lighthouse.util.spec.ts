import { mapLighthouseResult, PsiResponse } from './lighthouse.util';

/**
 * Trimmed PageSpeed Insights v5 response, in Lighthouse 12's shape: only the
 * fields mapLighthouseResult reads, with one example of each case it
 * distinguishes (opportunity with savings, metricSavings-only insight, metric
 * row, passed audit, informative/manual rows, failed SEO and a11y audits, an
 * audit referenced by two categories).
 */
const FIXTURE: PsiResponse = {
  lighthouseResult: {
    finalDisplayedUrl: 'https://example.com/',
    categories: {
      performance: {
        score: 0.42,
        auditRefs: [
          { id: 'largest-contentful-paint', weight: 25, group: 'metrics' },
          { id: 'total-blocking-time', weight: 30, group: 'metrics' },
          { id: 'render-blocking-resources', weight: 0 },
          { id: 'unused-javascript', weight: 0 },
          { id: 'uses-long-cache-ttl', weight: 0 },
          { id: 'diagnostics', weight: 0 },
        ],
      },
      seo: {
        score: 0.83,
        auditRefs: [
          { id: 'meta-description', weight: 1 },
          { id: 'document-title', weight: 1 },
          { id: 'structured-data', weight: 0 },
        ],
      },
      accessibility: {
        score: 0.775,
        auditRefs: [
          { id: 'color-contrast', weight: 7 },
          { id: 'image-alt', weight: 10 },
        ],
      },
      'best-practices': {
        score: 1,
        auditRefs: [{ id: 'image-alt', weight: 1 }],
      },
    },
    audits: {
      'largest-contentful-paint': {
        id: 'largest-contentful-paint',
        title: 'Largest Contentful Paint',
        score: 0.1,
        scoreDisplayMode: 'numeric',
        numericValue: 6123.4,
      },
      'total-blocking-time': {
        id: 'total-blocking-time',
        title: 'Total Blocking Time',
        score: 0.3,
        scoreDisplayMode: 'numeric',
        numericValue: 812.6,
      },
      'cumulative-layout-shift': {
        id: 'cumulative-layout-shift',
        title: 'Cumulative Layout Shift',
        score: 0.9,
        scoreDisplayMode: 'numeric',
        numericValue: 0.04567,
      },
      'first-contentful-paint': {
        id: 'first-contentful-paint',
        title: 'First Contentful Paint',
        score: 0.5,
        scoreDisplayMode: 'numeric',
        numericValue: 2400,
      },
      'render-blocking-resources': {
        id: 'render-blocking-resources',
        title: 'Eliminate render-blocking resources',
        score: 0.2,
        scoreDisplayMode: 'metricSavings',
        displayValue: 'Potential savings of 1,450 ms',
        details: { type: 'opportunity', overallSavingsMs: 1450 },
      },
      'unused-javascript': {
        id: 'unused-javascript',
        title: 'Reduce unused JavaScript',
        score: 0.5,
        scoreDisplayMode: 'metricSavings',
        metricSavings: { LCP: 600, FCP: 300 },
      },
      'uses-long-cache-ttl': {
        id: 'uses-long-cache-ttl',
        title: 'Serve static assets with an efficient cache policy',
        score: 1,
        scoreDisplayMode: 'metricSavings',
      },
      diagnostics: {
        id: 'diagnostics',
        title: 'Diagnostics',
        score: null,
        scoreDisplayMode: 'informative',
      },
      'meta-description': {
        id: 'meta-description',
        title: 'Document does not have a meta description',
        score: 0,
        scoreDisplayMode: 'binary',
      },
      'document-title': {
        id: 'document-title',
        title: 'Document has a `<title>` element',
        score: 1,
        scoreDisplayMode: 'binary',
      },
      'structured-data': {
        id: 'structured-data',
        title: 'Structured data is valid',
        score: null,
        scoreDisplayMode: 'manual',
      },
      'color-contrast': {
        id: 'color-contrast',
        title:
          'Background and foreground colors do not have a sufficient contrast ratio.',
        score: 0,
        scoreDisplayMode: 'binary',
      },
      'image-alt': {
        id: 'image-alt',
        title: 'Image elements do not have `[alt]` attributes',
        score: 0,
        scoreDisplayMode: 'binary',
      },
    },
  },
};

describe('mapLighthouseResult', () => {
  const mapped = mapLighthouseResult(FIXTURE);

  it('converts category scores to 0–100', () => {
    expect(mapped.scores).toEqual({
      performance: 42,
      seo: 83,
      accessibility: 78,
      bestPractices: 100,
    });
  });

  it('reads lab vitals, rounded', () => {
    expect(mapped.vitals).toEqual({
      lcpMs: 6123,
      cls: 0.046,
      tbtMs: 813,
      fcpMs: 2400,
    });
  });

  it('lists fixable failures — not metric rows, passes, info or manual checks', () => {
    expect(mapped.issues.map((i) => i.id)).toEqual([
      'render-blocking-resources',
      'unused-javascript',
      'image-alt',
      'color-contrast',
      'meta-description',
    ]);
  });

  it('puts time savings first and reads them from either Lighthouse field', () => {
    expect(mapped.issues[0]).toEqual({
      id: 'render-blocking-resources',
      title: 'Eliminate render-blocking resources',
      displayValue: 'Potential savings of 1,450 ms',
      savingsMs: 1450,
      category: 'performance',
    });
    expect(mapped.issues[1].savingsMs).toBe(600);
  });

  it('counts an audit shared by two categories once', () => {
    expect(mapped.issues.filter((i) => i.id === 'image-alt')).toHaveLength(1);
  });

  it('throws on a response with no categories', () => {
    expect(() => mapLighthouseResult({})).toThrow('no categories');
  });
});
