import type { Request } from 'express';
import { resolveClientContext } from './client-context.util';

const SECRET = 'x'.repeat(40);

function request(headers: Record<string, string>, ip = '10.0.0.5') {
  return { headers, ip } as unknown as Request;
}

describe('resolveClientContext', () => {
  it('trusts the forwarded visitor IP/UA when the internal secret matches', () => {
    const ctx = resolveClientContext(
      request({
        'x-internal-secret': SECRET,
        'x-client-ip': '203.0.113.7',
        'x-client-ua': 'Mozilla/5.0 (visitor)',
        'user-agent': 'node',
      }),
      SECRET,
    );
    expect(ctx).toEqual({
      clientIp: '203.0.113.7',
      clientUa: 'Mozilla/5.0 (visitor)',
    });
  });

  it('ignores forwarded headers without the secret — they are spoofable by anyone calling the API', () => {
    const ctx = resolveClientContext(
      request({
        'x-client-ip': '1.2.3.4',
        'x-client-ua': 'forged',
        'user-agent': 'curl/8',
      }),
      SECRET,
    );
    expect(ctx).toEqual({ clientIp: '10.0.0.5', clientUa: 'curl/8' });
  });

  it('ignores forwarded headers with a wrong secret', () => {
    const ctx = resolveClientContext(
      request({ 'x-internal-secret': 'wrong', 'x-client-ip': '1.2.3.4' }),
      SECRET,
    );
    expect(ctx.clientIp).toBe('10.0.0.5');
  });

  it('ignores forwarded headers entirely when no secret is configured', () => {
    const ctx = resolveClientContext(
      request({ 'x-internal-secret': '', 'x-client-ip': '1.2.3.4' }),
      undefined,
    );
    expect(ctx.clientIp).toBe('10.0.0.5');
  });
});
