import { classifySubmission } from './spam-filter.util';

describe('classifySubmission', () => {
  const ok = (name: string, message: string) =>
    expect(classifySubmission({ name, message })).toEqual({ spam: false });
  const spam = (name: string, message: string) =>
    expect(classifySubmission({ name, message }).spam).toBe(true);

  it('passes an ordinary project enquiry', () => {
    ok(
      'Ada Lovelace',
      'We need an internal operations dashboard for our logistics team. Can we talk next week?',
    );
  });

  it('passes a single link — clients share their current site', () => {
    ok('Ada Lovelace', 'Our current site is https://example.com, it is slow.');
  });

  it('flags two or more links', () => {
    spam('Ada', 'See https://a.example.com and www.b.example.com');
  });

  it('flags BBCode / HTML links', () => {
    spam('Ada', 'Great offer [url=https://x.example]click[/url]');
    spam('Ada', 'Great offer <a href="https://x.example">click</a>');
  });

  it('flags a link in the name fields', () => {
    spam('https://spam.example', 'Hello');
  });

  it('flags common SEO / backlink pitches, case-insensitively', () => {
    spam('Mark', 'I can get you on the FIRST PAGE OF GOOGLE quickly');
    spam('Mark', 'We sell high quality Backlinks for your domain');
  });
});
