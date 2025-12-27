import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookieResponses = new Map<string, unknown[]>();
const getCookiesMock = vi.fn((options: { url: string; origins?: string[] }) => {
  const origins = new Set<string>();
  for (const candidate of options.origins ?? []) {
    try {
      origins.add(new URL(candidate).origin);
    } catch {
      // ignore malformed origin candidates
    }
  }
  const cookies: unknown[] = [];
  for (const origin of origins) {
    const items = cookieResponses.get(origin);
    if (Array.isArray(items)) {
      cookies.push(...items);
    }
  }
  return { cookies, warnings: [] };
});

vi.mock('@steipete/sweet-cookie', () => ({
  getCookies: getCookiesMock,
}));

vi.mock('tldjs', () => ({
  getDomain: (uri: string) => {
    try {
      return new URL(uri).hostname;
    } catch {
      return null;
    }
  },
}));

const loadConfigMock = vi.fn(() => ({
  config: {
    cookieMappings: [
      {
        hosts: ['localhost'],
        origins: ['https://example-auth.dev'],
      },
    ],
  },
}));

vi.mock('../../src/core/config-file', () => ({
  loadSweetLinkFileConfig: loadConfigMock,
}));

const cliEnvMock = {
  chromeProfilePath: '/Users/me/Library/Application Support/Google/Chrome/Profile 1',
  cookieDebug: false,
};

vi.mock('../../src/env', () => ({
  cliEnv: cliEnvMock,
}));

const { collectChromeCookies, collectChromeCookiesForDomains } = await import('../../src/runtime/cookies');

beforeEach(() => {
  cookieResponses.clear();
  getCookiesMock.mockClear();
});

describe('collectChromeCookies', () => {
  it('rehomes cookies for localhost targets and prunes incompatible entries', async () => {
    cookieResponses.set('https://localhost:4455', [
      {
        name: '__Secure-session',
        value: 'abc',
        domain: 'localhost',
        path: '/',
        sameSite: 'None',
        secure: true,
        httpOnly: true,
      },
      {
        name: '_vercel_session',
        value: 'discard',
        domain: 'localhost',
        path: '/',
      },
    ]);
    cookieResponses.set('https://example-auth.dev', [
      {
        name: 'auth-token',
        value: 'xyz',
        domain: 'example.dev',
        path: '/',
      },
    ]);

    const result = await collectChromeCookies('https://localhost:4455/dashboard');

    const names = result.map((cookie) => cookie.name);
    expect(names).toContain('__Secure-session');
    expect(names).toContain('auth-token');
    expect(names).not.toContain('_vercel_session');

    expect(getCookiesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://localhost:4455/dashboard',
        chromeProfile: cliEnvMock.chromeProfilePath,
        browsers: ['chrome'],
      })
    );
    const call = getCookiesMock.mock.calls[0]?.[0] as { origins?: string[] } | undefined;
    expect(call?.origins ?? []).toEqual(expect.arrayContaining(['https://localhost:4455', 'https://example-auth.dev']));
  });

  it('normalizes secure cookies when targeting http origins', async () => {
    cookieResponses.set('http://internal.dev', [
      {
        name: '__Secure-auth',
        value: 'token',
        path: '/',
        sameSite: 'None',
        secure: true,
      },
    ]);

    const result = await collectChromeCookies('http://internal.dev/app');

    expect(result).toEqual([
      expect.objectContaining({ name: 'auth', sameSite: 'Lax', secure: false, url: 'http://internal.dev' }),
    ]);
  });

  it('returns empty results when no cookies are returned', async () => {
    const cookies = await collectChromeCookies('https://example.dev/app');

    expect(cookies).toEqual([]);
  });

  it('delegates cookie collection to sweet-cookie', async () => {
    await collectChromeCookies('https://localhost:4455/dashboard');

    expect(getCookiesMock).toHaveBeenCalledTimes(1);
  });
});

describe('collectChromeCookiesForDomains', () => {
  it('groups cookies per domain and normalizes entries', async () => {
    cookieResponses.set('https://example.dev', [
      {
        name: 'session',
        value: '123',
        domain: 'example.dev',
        path: '/',
      },
    ]);

    const result = await collectChromeCookiesForDomains(['example.dev']);

    expect(result['example.dev']).toHaveLength(1);
    expect(result['example.dev'][0]).toMatchObject({
      name: 'session',
      domain: 'example.dev',
      path: '/',
    });
    expect(getCookiesMock).toHaveBeenCalled();
  });
});
