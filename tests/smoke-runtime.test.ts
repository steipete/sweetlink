import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SweetLinkConsoleDump, SweetLinkSessionSummary } from '../src/runtime/session';
/* biome-ignore lint/performance/noNamespaceImport: tests need the namespace to spy on smoke runtime functions dynamically. */
import * as SmokeRuntime from '../src/runtime/smoke';

const sessionModuleMocks = vi.hoisted(() => ({
  __esModule: true,
  executeRunScriptCommand: vi.fn(),
  fetchSessionSummaries: vi.fn(),
  getSessionSummaryById: vi.fn(),
}));

const devtoolsModuleMocks = vi.hoisted(() => ({
  __esModule: true,
  collectBootstrapDiagnostics: vi.fn(),
  diagnosticsContainBlockingIssues: vi.fn(),
  evaluateInDevToolsTab: vi.fn().mockResolvedValue(),
}));

const timeModuleMocks = vi.hoisted(() => ({
  __esModule: true,
  delay: vi.fn(() => Promise.resolve()),
}));

vi.mock('../src/runtime/session', () => sessionModuleMocks);
vi.mock('../src/runtime/devtools', () => devtoolsModuleMocks);
vi.mock('../src/util/time', () => timeModuleMocks);

const {
  deriveSmokeRoutes,
  buildSmokeRouteUrl,
  ensureSweetLinkSessionConnected,
  consoleEventIndicatesAuthIssue,
  consoleEventIndicatesRuntimeError,
  formatConsoleEventSummary,
} = SmokeRuntime;

describe('runtime/smoke utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionModuleMocks.fetchSessionSummaries.mockReset();
    sessionModuleMocks.getSessionSummaryById.mockReset();
    sessionModuleMocks.executeRunScriptCommand.mockReset();
    devtoolsModuleMocks.evaluateInDevToolsTab.mockReset().mockResolvedValue();
    timeModuleMocks.delay.mockReset();
    timeModuleMocks.delay.mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('deriveSmokeRoutes', () => {
    it('expands preset tokens and deduplicates routes', () => {
      const result = deriveSmokeRoutes('main,settings,billing-only,pulse,pulse', ['fallback']);
      expect(result).toEqual([
        'timeline',
        'insights',
        'search',
        'pulse',
        'settings/account',
        'settings/activity',
        'settings/billing',
        'settings/notifications',
        'settings/social',
        'settings/sync',
        'settings/import',
        'settings/extension',
        'settings/beta',
      ]);
    });

    it('falls back to defaults when user input is empty', () => {
      const defaults = ['timeline', 'insights'];
      expect(deriveSmokeRoutes('', defaults)).toEqual(defaults);
      expect(deriveSmokeRoutes('   ', defaults)).toEqual(defaults);
    });
  });

  describe('buildSmokeRouteUrl', () => {
    it('normalizes relative routes and applies sweetlink flag', () => {
      const base = new URL('http://localhost:3000/timeline?sweetlink=auto');
      const target = buildSmokeRouteUrl(base, 'insights?tab=overview');
      expect(target.toString()).toBe('http://localhost:3000/insights?tab=overview&sweetlink=auto');
    });

    it('preserves absolute URLs while forcing sweetlink telemetry', () => {
      const base = new URL('http://localhost:3000/');
      const target = buildSmokeRouteUrl(base, 'https://example.com/dashboard?foo=bar');
      expect(target.toString()).toBe('https://example.com/dashboard?foo=bar&sweetlink=auto');
    });
  });

  describe('ensureSweetLinkSessionConnected', () => {
    const config = { daemonUrl: 'http://localhost:4141', apiKey: 'local' } as const;

    it('resolves immediately when the active session socket is already open', async () => {
      sessionModuleMocks.getSessionSummaryById.mockResolvedValue({
        sessionId: 'abc',
        url: 'http://localhost:3000/timeline',
        title: 'Timeline',
        topOrigin: 'http://localhost:3000',
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
        socketState: 'open',
      } satisfies SweetLinkSessionSummary);

      const result = await ensureSweetLinkSessionConnected({
        config,
        token: 'token',
        sessionId: 'abc',
        devtoolsUrl: 'http://127.0.0.1:9222',
        currentUrl: 'http://localhost:3000/timeline',
        timeoutMs: 500,
      });

      expect(result).toBe(true);
      expect(sessionModuleMocks.getSessionSummaryById).toHaveBeenCalledTimes(1);
      expect(devtoolsModuleMocks.evaluateInDevToolsTab).not.toHaveBeenCalled();
    });

    it('rescues by matching a replacement session and notifies the caller', async () => {
      sessionModuleMocks.getSessionSummaryById.mockResolvedValueOnce(null);
      sessionModuleMocks.fetchSessionSummaries.mockResolvedValue([
        {
          sessionId: 'replacement',
          url: 'http://localhost:3000/insights?sweetlink=auto',
          title: 'Insights',
          topOrigin: 'http://localhost:3000',
          createdAt: Date.now(),
          lastSeenAt: Date.now(),
          socketState: 'open',
        },
      ] satisfies SweetLinkSessionSummary[]);

      const onSessionIdChanged = vi.fn();

      const result = await ensureSweetLinkSessionConnected({
        config,
        token: 'token',
        sessionId: 'abc',
        devtoolsUrl: 'http://127.0.0.1:9222',
        currentUrl: 'http://localhost:3000/insights',
        timeoutMs: 500,
        onSessionIdChanged,
      });

      expect(result).toBe(true);
      expect(onSessionIdChanged).toHaveBeenCalledWith('replacement');
      expect(sessionModuleMocks.fetchSessionSummaries).toHaveBeenCalledTimes(1);
    });

    it('returns false when timeout elapses without a live session', async () => {
      sessionModuleMocks.getSessionSummaryById.mockResolvedValue(null);
      sessionModuleMocks.fetchSessionSummaries.mockResolvedValue([]);

      const triggerSpy = vi.spyOn(SmokeRuntime, 'triggerSweetLinkCliAuto');

      const result = await ensureSweetLinkSessionConnected({
        config,
        token: 'token',
        sessionId: 'abc',
        devtoolsUrl: 'http://127.0.0.1:9222',
        currentUrl: 'http://localhost:3000/insights',
        timeoutMs: 0,
      });

      expect(result).toBe(false);
      expect(triggerSpy).not.toHaveBeenCalled();
    });
  });

  describe('console heuristics', () => {
    it('flags authentication messages', () => {
      const event = {
        id: 'evt-1',
        timestamp: Date.now(),
        level: 'error',
        args: ['Authentication required for /api/session'],
      } satisfies SweetLinkConsoleDump;

      expect(consoleEventIndicatesAuthIssue(event)).toBe(true);
    });

    it('ignores benign info events', () => {
      const event = {
        id: 'evt-2',
        timestamp: Date.now(),
        level: 'info',
        args: ['[tRPC] user.getCurrent resolved'],
      } satisfies SweetLinkConsoleDump;

      expect(consoleEventIndicatesRuntimeError(event)).toBe(false);
    });

    it('detects runtime errors even when logged as strings', () => {
      const event = {
        id: 'evt-3',
        timestamp: Date.now(),
        level: 'log',
        args: ['Unhandled rejection Error: SweetLink auto-activation failed'],
      } satisfies SweetLinkConsoleDump;

      expect(consoleEventIndicatesRuntimeError(event)).toBe(true);
    });

    it('formats console event summaries with ISO timestamps', () => {
      const event = {
        id: 'evt-4',
        timestamp: Date.UTC(2025, 10, 4, 15, 0, 0),
        level: 'warn',
        args: ['SweetLink auto-activation failed: 401'],
      } satisfies SweetLinkConsoleDump;

      expect(formatConsoleEventSummary(event)).toBe(
        '[2025-11-04T15:00:00.000Z] warn SweetLink auto-activation failed: 401'
      );
    });
  });
});
