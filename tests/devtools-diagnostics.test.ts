import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request as PlaywrightRequest } from 'playwright-core';
import type { DevToolsConsoleEntry, SweetLinkBootstrapDiagnostics } from '../src/runtime/devtools';

vi.mock('playwright-core', () => ({
  chromium: {
    connect: vi.fn(),
  },
}));

vi.mock('undici', () => ({ WebSocket: class {} }));
vi.mock('../src/util/time', () => ({
  delay: vi.fn().mockResolvedValue(undefined),
}));

const fetchMock = vi.fn();

const globalWithFetch: { fetch?: unknown } = globalThis;

beforeAll(() => {
  globalWithFetch.fetch = fetchMock;
});

afterAll(() => {
  globalWithFetch.fetch = undefined;
});

beforeEach(() => {
  fetchMock.mockReset();
});

const devtoolsModule = await import('../src/runtime/devtools');
const {
  logBootstrapDiagnostics,
  diagnosticsContainBlockingIssues,
  logDevtoolsConsoleSummary,
  formatConsoleArg,
  createNetworkEntryFromRequest,
  fetchDevToolsTabs,
  fetchDevToolsTabsWithRetry,
} = devtoolsModule;
const timeModule = await import('../src/util/time');
const delay = vi.mocked(timeModule.delay);

describe('runtime/devtools diagnostics logging', () => {
  const captured: string[] = [];

  beforeEach(() => {
    captured.length = 0;
    vi.spyOn(console, 'warn').mockImplementation((message?: unknown) => {
      if (typeof message === 'string') {
        captured.push(message);
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs a concise summary with auth hints, overlay details, and route errors', () => {
    const diagnostics: SweetLinkBootstrapDiagnostics = {
      readyState: 'loading',
      autoFlag: true,
      bootstrapEmits: 3,
      sessionStorageAuto: 'pending',
      errors: [
        {
          type: 'auth-fetch',
          message: 'Authentication required for /api/auth/get-session',
          status: 401,
          source: 'auth.ts',
        },
        {
          type: 'error',
          message: 'Unhandled runtime exception',
          source: '/app/page.tsx',
          stack: 'Error: boom\n    at render (app/page.tsx:12:4)',
        },
      ],
      overlayText: 'Build Error\n   Error evaluating Node.js code',
      nextRouteError: { message: 'Route failed to load', digest: 'abcd1234' },
    };

    logBootstrapDiagnostics('SweetLink smoke', diagnostics);

    expect(captured[0]).toContain('SweetLink smoke document=loading');
    expect(captured).toContainEqual(
      expect.stringContaining('Detected 1 authentication failure while loading the page.')
    );
    expect(captured).toContainEqual(expect.stringContaining('auth status=401 (auth.ts): Authentication required'));
    expect(captured).toContainEqual(
      expect.stringContaining('SweetLink smoke console error (/app/page.tsx): Unhandled runtime exception')
    );
    expect(captured).toContainEqual(expect.stringContaining('SweetLink smoke Next.js overlay:'));
    expect(captured).toContainEqual(expect.stringContaining('SweetLink smoke route error: Route failed to load'));
  });

  it('summarises console entries and filters benign logs', () => {
    const entries: DevToolsConsoleEntry[] = [
      {
        ts: Date.now() - 1000,
        type: 'log',
        text: '[Fast Refresh] rebuilding',
        args: [],
      },
      {
        ts: Date.now(),
        type: 'error',
        text: 'Unhandled rejection Error: SweetLink auto-activation failed',
        args: ['Unhandled rejection Error: SweetLink auto-activation failed'],
      },
    ];

    logDevtoolsConsoleSummary('SweetLink smoke', entries, 5);

    expect(captured).toContainEqual(expect.stringContaining('SweetLink smoke: showing 1 error/warn console event'));
    expect(captured).toContainEqual(
      expect.stringContaining('Unhandled rejection Error: SweetLink auto-activation failed')
    );
  });
});

describe('diagnosticsContainBlockingIssues', () => {
  it('returns true when overlays, route errors, or auth failures are present', () => {
    expect(
      diagnosticsContainBlockingIssues({
        overlayText: 'Build Error',
      })
    ).toBe(true);

    expect(
      diagnosticsContainBlockingIssues({
        nextRouteError: { message: 'Route failed', digest: '123' },
      })
    ).toBe(true);

    expect(
      diagnosticsContainBlockingIssues({
        errors: [{ type: 'auth-fetch', message: 'Authentication required', status: 401 }],
      })
    ).toBe(true);
  });

  it('ignores ignorable console noise and benign errors', () => {
    expect(
      diagnosticsContainBlockingIssues({
        errors: [{ type: 'log', message: 'Intentional break for SweetLink session test' }],
      })
    ).toBe(false);
  });
});

describe('formatConsoleArg', () => {
  it('returns string values intact and serializes objects when possible', () => {
    expect(formatConsoleArg('text')).toBe('text');
    expect(formatConsoleArg({ ok: true })).toBe(JSON.stringify({ ok: true }));
  });

  it('falls back to String conversion when JSON serialization fails', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(formatConsoleArg(circular)).toBe('[object Object]');
  });
});

describe('createNetworkEntryFromRequest', () => {
  it('captures metadata from Playwright request objects', () => {
    const mockRequest = {
      method: () => 'POST',
      url: () => 'https://example.dev/api',
      resourceType: () => 'xhr',
    } satisfies Pick<PlaywrightRequest, 'method' | 'url' | 'resourceType'>;

    const entry = createNetworkEntryFromRequest(mockRequest, 200, undefined);

    expect(entry.method).toBe('POST');
    expect(entry.url).toBe('https://example.dev/api');
    expect(entry.resourceType).toBe('xhr');
    expect(entry.status).toBe(200);
    expect(entry.failureText).toBeUndefined();
    expect(typeof entry.ts).toBe('number');
  });
});

describe('fetchDevToolsTabs', () => {
  it('normalizes the DevTools tab payload', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'tab-1',
          title: 'Sweetistics',
          url: 'https://app.example.dev',
          type: 'page',
          webSocketDebuggerUrl: 'ws://example.dev/devtools/page/tab-1',
        },
        {
          id: null,
          title: 'blank',
        },
      ],
    });

    const tabs = await fetchDevToolsTabs('http://127.0.0.1:9222');

    expect(tabs).toEqual([
      {
        id: 'tab-1',
        title: 'Sweetistics',
        url: 'https://app.example.dev',
        type: 'page',
        webSocketDebuggerUrl: 'ws://example.dev/devtools/page/tab-1',
      },
    ]);
  });

  it('throws when the DevTools endpoint responds with an error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Error' });

    await expect(fetchDevToolsTabs('http://127.0.0.1:9222')).rejects.toThrow('DevTools endpoint responded with 500');
  });

  it('throws when the payload is not an array', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ invalid: true }) });

    await expect(fetchDevToolsTabs('http://127.0.0.1:9222')).rejects.toThrow(
      'DevTools endpoint returned unexpected payload'
    );
  });
});

describe('fetchDevToolsTabsWithRetry', () => {
  beforeEach(() => {
    delay.mockClear();
  });

  it('returns immediately when tabs are discovered on the first attempt', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'tab-1', title: 'App', url: 'https://app.example.dev', type: 'page' }],
    });

    const tabs = await fetchDevToolsTabsWithRetry('http://127.0.0.1:9222');

    expect(tabs).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
  });

  it('retries ECONNREFUSED failures and returns an empty array when none are available', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1'));

    const tabs = await fetchDevToolsTabsWithRetry('http://127.0.0.1:9555', 2);

    expect(tabs).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(200);
  });
});
