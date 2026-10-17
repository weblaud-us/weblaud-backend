import { scrubSentryEvent, stripQuery } from './sentry-scrub.util';

describe('scrubSentryEvent', () => {
  it('removes bodies, cookies, query strings, secret headers and user details', () => {
    const event = scrubSentryEvent({
      request: {
        url: 'https://api.weblaud.com/api/v1/auth/accept-invite?uid=1&token=secret',
        data: { password: 'hunter2' },
        cookies: { refresh: 'x' },
        query_string: 'uid=1&token=secret',
        headers: {
          Authorization: 'Bearer abc',
          Cookie: 'a=b',
          'X-Internal-Secret': 's3cret',
          'x-client-ip': '1.2.3.4',
          'User-Agent': 'curl/8',
          'content-type': 'application/json',
        },
      },
      user: { id: 'u1', email: 'a@b.test', ip_address: '1.2.3.4' },
      breadcrumbs: [{ data: { url: '/portal/accept-invite?uid=1&token=t', method: 'GET' } }],
    });

    expect(event.request).toEqual({
      url: 'https://api.weblaud.com/api/v1/auth/accept-invite',
      headers: { 'User-Agent': 'curl/8', 'content-type': 'application/json' },
    });
    expect(event.user).toEqual({ id: 'u1' });
    expect(event.breadcrumbs[0].data).toEqual({ url: '/portal/accept-invite', method: 'GET' });
  });

  it('leaves an event without a request alone', () => {
    expect(scrubSentryEvent({ message: 'boom' })).toEqual({ message: 'boom' });
  });
});

describe('stripQuery', () => {
  it('drops the query string and fragment', () => {
    expect(stripQuery('/a/b?x=1#y')).toBe('/a/b');
    expect(stripQuery('/a/b#y')).toBe('/a/b');
    expect(stripQuery('/a/b')).toBe('/a/b');
  });
});
