import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookieResponses = new Map<string, Record<string, unknown>[]>();
const defaultGetCookiesPromisedImpl = (origin: string) => {
  const normalized = origin.endsWith('/') ? origin : `${origin}/`;
  return Promise.resolve(cookieResponses.get(normalized) ?? []);
};
const getCookiesPromisedMock = vi.fn(defaultGetCookiesPromisedImpl);

const shouldFailChromeModule = vi.hoisted(() => ({ value: false }));

vi.mock('chrome-cookies-secure', () => {
  if (shouldFailChromeModule.value) {
    throw new Error('module load failed');
  }
  return {
    getCookiesPromised: getCookiesPromisedMock,
  };
});

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
  getCookiesPromisedMock.mockClear();
  getCookiesPromisedMock.mockImplementation(defaultGetCookiesPromisedImpl);
});

describe('collectChromeCookies', () => {
  it('rehomes cookies for localhost targets and prunes incompatible entries', async () => {
    cookieResponses.set('https://localhost:4455/', [
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
    cookieResponses.set('https://example-auth.dev/', [
      {
        name: 'auth-token',
        value: 'xyz',
        domain: '.example.dev',
        path: '/',
      },
    ]);

    const result = await collectChromeCookies('https://localhost:4455/dashboard');

    const names = result.map((cookie) => cookie.name);
    expect(names).toContain('__Secure-session');
    expect(names).toContain('auth-token');
    expect(names).not.toContain('_vercel_session');
    expect(getCookiesPromisedMock).toHaveBeenCalledWith(
      'https://localhost:4455/',
      'puppeteer',
      cliEnvMock.chromeProfilePath
    );
    expect(getCookiesPromisedMock).toHaveBeenCalledWith(
      'https://example-auth.dev/',
      'puppeteer',
      cliEnvMock.chromeProfilePath
    );
  });

  it('normalizes secure cookies when targeting http origins', async () => {
    cookieResponses.set('http://internal.dev/', [
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

  it('returns empty results when chrome-cookies-secure cannot be loaded', async () => {
    shouldFailChromeModule.value = true;

    const cookies = await collectChromeCookies('https://example.dev/app');

    expect(cookies).toEqual([]);
    shouldFailChromeModule.value = false;
  });

  it('reads cookie origins sequentially to avoid sqlite contention', async () => {
    const tracker = { inFlight: 0, maxInFlight: 0 };
    getCookiesPromisedMock.mockImplementation(async () => {
      tracker.inFlight += 1;
      tracker.maxInFlight = Math.max(tracker.maxInFlight, tracker.inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      tracker.inFlight -= 1;
      return [];
    });

    await collectChromeCookies('https://localhost:4455/dashboard');

    expect(tracker.maxInFlight).toBe(1);
  });
});

describe('collectChromeCookiesForDomains', () => {
  it('groups cookies per domain and normalizes entries', async () => {
    cookieResponses.set('https://example.dev/', [
      {
        name: 'session',
        value: '123',
        domain: '.example.dev',
        path: '/',
      },
    ]);

    const result = await collectChromeCookiesForDomains(['example.dev']);

    expect(result['example.dev']).toHaveLength(1);
    expect(result['example.dev'][0]).toMatchObject({
      name: 'session',
      domain: '.example.dev',
      path: '/',
    });
    expect(getCookiesPromisedMock).toHaveBeenCalled();
  });
});
