import {
  BadRequestException,
  ExecutionContext,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { CaptchaGuard } from './captcha.guard';
import { CAPTCHA_ACTION_KEY } from '../decorators/captcha-action.decorator';

/**
 * The guard reads route metadata, so the fake context needs the handler/class
 * pair Reflector resolves against. `expectedAction` stands in for a route's
 * @CaptchaAction; undefined models a route that forgot it.
 */
function contextFor(
  headers: Record<string, string>,
  clientIp?: string,
  expectedAction?: string,
): ExecutionContext {
  const req = { headers, clientIp };
  const handler = function submit() {};
  class FakeController {}

  if (expectedAction !== undefined) {
    Reflect.defineMetadata(CAPTCHA_ACTION_KEY, expectedAction, handler);
  }

  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => FakeController,
  } as unknown as ExecutionContext;
}

interface GuardConfig {
  secret?: string;
  hostnames?: string[];
}

function guardWith({ secret, hostnames = [] }: GuardConfig) {
  const config = {
    get: jest.fn((key: string) =>
      key === 'turnstile.secretKey' ? secret : hostnames,
    ),
  };
  return new CaptchaGuard(config as unknown as ConfigService, new Reflector());
}

const guardWithSecret = (secret: string | undefined) => guardWith({ secret });

const fetchMock = jest.fn();

/** The form-encoded body of the siteverify call the guard just made. */
function lastSiteverifyBody(): URLSearchParams {
  const [, init] = fetchMock.mock.calls[0] as [
    string,
    { body: URLSearchParams },
  ];
  return init.body;
}

describe('CaptchaGuard', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
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

  it('rejects an oversized token without asking Cloudflare', async () => {
    await expect(
      guardWithSecret('secret').canActivate(
        contextFor({ 'x-captcha-token': 'x'.repeat(2049) }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a token Cloudflare verifies, passing the visitor IP along', async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });

    await expect(
      guardWithSecret('secret').canActivate(
        contextFor({ 'x-captcha-token': 'tok' }, '203.0.113.7'),
      ),
    ).resolves.toBe(true);

    const body = lastSiteverifyBody();
    expect(body.get('secret')).toBe('secret');
    expect(body.get('response')).toBe('tok');
    expect(body.get('remoteip')).toBe('203.0.113.7');
  });

  it('rejects a token Cloudflare refuses', async () => {
    fetchMock.mockResolvedValue({
      json: () =>
        Promise.resolve({
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

  describe('action binding', () => {
    it('accepts a token minted for this route', async () => {
      fetchMock.mockResolvedValue({
        json: () => Promise.resolve({ success: true, action: 'contact' }),
      });

      await expect(
        guardWith({ secret: 's' }).canActivate(
          contextFor({ 'x-captcha-token': 'tok' }, undefined, 'contact'),
        ),
      ).resolves.toBe(true);
    });

    it('rejects a valid token minted for a different form', async () => {
      // The whole point: a token farmed from the contact widget must not buy
      // a job application upload.
      fetchMock.mockResolvedValue({
        json: () => Promise.resolve({ success: true, action: 'contact' }),
      });

      await expect(
        guardWith({ secret: 's' }).canActivate(
          contextFor(
            { 'x-captcha-token': 'tok' },
            undefined,
            'job-application',
          ),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows a route with no @CaptchaAction through, so adding the guard alone still works', async () => {
      fetchMock.mockResolvedValue({
        json: () => Promise.resolve({ success: true, action: 'anything' }),
      });

      await expect(
        guardWith({ secret: 's' }).canActivate(
          contextFor({ 'x-captcha-token': 'tok' }),
        ),
      ).resolves.toBe(true);
    });

    it("skips the bindings for Cloudflare's testing secret, which echoes no action", async () => {
      // The always-passes test key returns { success: true, hostname:
      // 'example.com' } and no action at all, so applying the bindings would
      // reject every submission in local dev.
      fetchMock.mockResolvedValue({
        json: () => Promise.resolve({ success: true, hostname: 'example.com' }),
      });

      await expect(
        guardWith({
          secret: '1x0000000000000000000000000000000AA',
          hostnames: ['weblaud.com'],
        }).canActivate(
          contextFor({ 'x-captcha-token': 'tok' }, undefined, 'contact'),
        ),
      ).resolves.toBe(true);
    });

    it('still rejects what Cloudflare refuses even with a testing secret', async () => {
      fetchMock.mockResolvedValue({
        json: () =>
          Promise.resolve({
            success: false,
            'error-codes': ['invalid-input-response'],
          }),
      });

      await expect(
        guardWith({
          secret: '2x0000000000000000000000000000000AA',
        }).canActivate(
          contextFor({ 'x-captcha-token': 'tok' }, undefined, 'contact'),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('hostname allowlist', () => {
    it('accepts a hostname on the list, case-insensitively', async () => {
      fetchMock.mockResolvedValue({
        json: () => Promise.resolve({ success: true, hostname: 'WebLaud.com' }),
      });

      await expect(
        guardWith({ secret: 's', hostnames: ['weblaud.com'] }).canActivate(
          contextFor({ 'x-captcha-token': 'tok' }),
        ),
      ).resolves.toBe(true);
    });

    it('rejects a token minted on a page we do not serve', async () => {
      fetchMock.mockResolvedValue({
        json: () =>
          Promise.resolve({ success: true, hostname: 'evil.example' }),
      });

      await expect(
        guardWith({ secret: 's', hostnames: ['weblaud.com'] }).canActivate(
          contextFor({ 'x-captcha-token': 'tok' }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('skips the check when TURNSTILE_HOSTNAMES is unset, rather than failing every form', async () => {
      fetchMock.mockResolvedValue({
        json: () =>
          Promise.resolve({ success: true, hostname: 'anything.example' }),
      });

      await expect(
        guardWith({ secret: 's', hostnames: [] }).canActivate(
          contextFor({ 'x-captcha-token': 'tok' }),
        ),
      ).resolves.toBe(true);
    });
  });
});
