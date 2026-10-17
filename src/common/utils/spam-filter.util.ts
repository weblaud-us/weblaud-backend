/**
 * Content rules for public form submissions — the second layer behind
 * CaptchaGuard. Turnstile stops automated posting; these catch what a human
 * spammer (or a solved captcha) still gets through: link-stuffed SEO pitches,
 * backlink offers, crypto/casino promos.
 *
 * Deliberately conservative. A false positive here is a lost client, so a
 * match never rejects the submission — the caller stores it as `spam` (no
 * notification email) where an admin can still find it and mark it "not spam".
 */

const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi;
const MARKUP_LINK_PATTERN = /\[url=|<a\s+href/i;

/**
 * Phrases that, in a message to a software agency, essentially only appear in
 * unsolicited pitches. Matched case-insensitively as substrings.
 */
const SPAM_PHRASES = [
  'backlink',
  'guest post',
  'link building',
  'seo services',
  'rank your website',
  'first page of google',
  'increase your traffic',
  'website traffic',
  'domain authority',
  'casino',
  'betting',
  'crypto investment',
  'bitcoin investment',
  'forex',
  'viagra',
  'cialis',
  'loan offer',
  'unsubscribe from future',
  'this is not spam',
];

export interface SubmissionContent {
  name: string;
  message: string;
}

export type SpamVerdict = { spam: false } | { spam: true; reason: string };

export function classifySubmission(input: SubmissionContent): SpamVerdict {
  const message = input.message ?? '';
  const name = input.name ?? '';

  if (MARKUP_LINK_PATTERN.test(message)) {
    return { spam: true, reason: 'markup link in message' };
  }

  const urlCount = message.match(URL_PATTERN)?.length ?? 0;
  if (urlCount >= 2) {
    return { spam: true, reason: `${urlCount} links in message` };
  }

  // A real name never contains a link; bots put their URL in every field.
  if (new RegExp(URL_PATTERN.source, 'i').test(name)) {
    return { spam: true, reason: 'link in name' };
  }

  const haystack = `${name} ${message}`.toLowerCase();
  const phrase = SPAM_PHRASES.find((p) => haystack.includes(p));
  if (phrase) {
    return { spam: true, reason: `matched "${phrase}"` };
  }

  return { spam: false };
}
