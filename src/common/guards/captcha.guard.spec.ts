import {
  BadRequestException,
  ExecutionContext,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CaptchaGuard } from './captcha.guard';

function contextFor(headers: Record<string, string>, clientIp?: string) {
  const req = { headers, clientIp };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function guardWithSecret(secret: string | undefined) {
  const config = { get: jest.fn().mockReturnValue(secret) };
  return new CaptchaGuard(config as unknown as ConfigService);
}

describe('CaptchaGuard', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('lets requests through when TURNSTILE_SECRET_KEY is unset (safe deploy ordering)', async () => {
    await expect(
      guardWithSecret(undefined).canActivate(contextFor({})),
    ).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a request with no token once a secret is configured', async () => {
    await expect(
      guardWithSecret('secret').canActivate(contextFor({})),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a token Cloudflare verifies, passing the visitor IP along', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ success: true }) });

    await expect(
      guardWithSecret('secret').canActivate(
        contextFor({ 'x-captcha-token': 'tok' }, '203.0.113.7'),
      ),
    ).resolves.toBe(true);

    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get('secret')).toBe('secret');
    expect(body.get('response')).toBe('tok');
    expect(body.get('remoteip')).toBe('203.0.113.7');
  });

  it('rejects a token Cloudflare refuses', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        success: false,
        'error-codes': ['invalid-input-response'],
      }),
    });

    await expect(
      guardWithSecret('secret').canActivate(
        contextFor({ 'x-captcha-token': 'bad' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fails closed when Cloudflare is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      guardWithSecret('secret').canActivate(
        contextFor({ 'x-captcha-token': 'tok' }),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
