import { regex } from 'arkregex';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const EMPTY_ENTRIES_PATTERN = regex.as(String.raw`"entries":\s*\[\]`);
import type { CliConfig } from '../../src/types';
import type { SweetLinkConsoleDump } from '../../src/runtime/session';

const readFileMock = vi.fn();
const writeFileMock = vi.fn();
const mkdirMock = vi.fn();

vi.mock('node:fs/promises', () => ({
  readFile: readFileMock,
  writeFile: writeFileMock,
  mkdir: mkdirMock,
}));

vi.mock('node:os', () => ({
  default: { homedir: () => '/tmp', tmpdir: () => '/tmp' },
  homedir: () => '/tmp',
  tmpdir: () => '/tmp',
}));

const loadConfigMock = vi.fn(() => ({
  config: {
    smokeRoutes: {
      defaults: ['dashboard'],
      presets: {
        custom: ['custom-route'],
      },
    },
    redirects: [],
  },
}));

vi.mock('../../src/core/config-file', () => ({
  loadSweetLinkFileConfig: loadConfigMock,
}));

const configurePathRedirectsMock = vi.fn();
const buildWaitCandidateUrlsMock = vi.fn((value: string) => [value]);
const urlsRoughlyMatchMock = vi.fn((a: string, b: string) => a === b);

vi.mock('../../src/runtime/url', () => ({
  configurePathRedirects: configurePathRedirectsMock,
  buildWaitCandidateUrls: buildWaitCandidateUrlsMock,
  urlsRoughlyMatch: urlsRoughlyMatchMock,
}));

const executeRunScriptCommandMock = vi.fn().mockResolvedValue(undefined);
const fetchSessionSummariesMock = vi.fn();
const getSessionSummaryByIdMock = vi.fn();

vi.mock('../../src/runtime/session', () => ({
  executeRunScriptCommand: executeRunScriptCommandMock,
  fetchSessionSummaries: fetchSessionSummariesMock,
  getSessionSummaryById: getSessionSummaryByIdMock,
}));

const collectBootstrapDiagnosticsMock = vi.fn();
const diagnosticsContainBlockingIssuesMock = vi.fn();
const evaluateInDevToolsTabMock = vi.fn();

vi.mock('../../src/runtime/devtools', () => ({
  collectBootstrapDiagnostics: collectBootstrapDiagnosticsMock,
  diagnosticsContainBlockingIssues: diagnosticsContainBlockingIssuesMock,
  evaluateInDevToolsTab: evaluateInDevToolsTabMock,
}));

vi.mock('../../src/env', () => ({
  sweetLinkDebug: true,
}));

const smokeModule = await import('../../src/runtime/smoke');

const createTestConfig = (overrides: Partial<CliConfig> = {}): CliConfig => ({
  appLabel: 'SweetLink Test',
  appBaseUrl: 'https://app.example.dev',
  daemonBaseUrl: 'https://daemon.example.dev',
  adminApiKey: null,
  oauthScriptPath: null,
  servers: {},
  ...overrides,
});

const createConsoleEvent = (overrides: Partial<SweetLinkConsoleDump>): SweetLinkConsoleDump => ({
  id: overrides.id ?? 'event-1',
  timestamp: overrides.timestamp ?? Date.now(),
  level: overrides.level ?? 'log',
  args: overrides.args ?? [],
});

const {
  SMOKE_ROUTE_PRESETS,
  deriveSmokeRoutes,
  buildSmokeRouteUrl,
  navigateSweetLinkSession,
  computeSmokeRouteSignature,
  loadSmokeProgressIndex,
  saveSmokeProgressIndex,
  clearSmokeProgress,
  consoleEventIndicatesAuthIssue,
  consoleEventIndicatesRuntimeError,
  formatConsoleEventSummary,
} = smokeModule;

beforeEach(() => {
  vi.restoreAllMocks();
  readFileMock.mockReset();
  writeFileMock.mockReset();
  mkdirMock.mockReset();
});

describe('smoke route helpers', () => {
  it('merges builtin and configured presets when deriving routes', () => {
    const routes = deriveSmokeRoutes('main,custom,/direct?foo=1', ['fallback']);
    expect(routes).toContain('timeline');
    expect(routes).toContain('custom-route');
    expect(routes).toContain('/direct?foo=1');
  });

  it('buildSmokeRouteUrl preserves query params and adds sweetlink flag', () => {
    const base = new URL('https://app.example.dev/app');
    const next = buildSmokeRouteUrl(base, '/pulse?view=weekly');

    expect(next.toString()).toBe('https://app.example.dev/pulse?view=weekly&sweetlink=auto');
  });

  it('exports configured smoke presets for reuse', () => {
    expect(SMOKE_ROUTE_PRESETS.custom).toEqual(['custom-route']);
  });
});

describe('SweetLink session navigation', () => {
  it('executes run-script commands with the normalized URL', async () => {
    await navigateSweetLinkSession({
      sessionId: 'session-xyz',
      targetUrl: new URL('https://app.example.dev/insights'),
      config: createTestConfig({ appBaseUrl: 'https://app.example.dev' }),
    });

    expect(executeRunScriptCommandMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ sessionId: 'session-xyz', captureConsole: false })
    );
    const script = executeRunScriptCommandMock.mock.calls[0][1].code;
    expect(script).toContain('sweetlink');
  });
});

describe('smoke progress persistence', () => {
  it('loads saved indices when present on disk', async () => {
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        entries: [
          {
            baseOrigin: 'https://app.example.dev',
            routesSignature: JSON.stringify(['dash']),
            nextIndex: 3,
            updatedAt: 10,
          },
        ],
      })
    );

    await expect(loadSmokeProgressIndex('https://app.example.dev', ['dash'])).resolves.toBe(3);
  });

  it('saves and clears smoke progress entries', async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify({ entries: [] })).mockResolvedValueOnce(
      JSON.stringify({
        entries: [
          {
            baseOrigin: 'https://app.example.dev',
            routesSignature: JSON.stringify(['dash']),
            nextIndex: 2,
            updatedAt: 10,
          },
        ],
      })
    );
    vi.spyOn(Date, 'now').mockReturnValue(5000);

    await saveSmokeProgressIndex('https://app.example.dev', ['dash'], 4);
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringContaining('.sweetlink/smoke-progress.json'),
      expect.stringContaining('"nextIndex": 4'),
      'utf8'
    );

    await clearSmokeProgress('https://app.example.dev', ['dash']);
    expect(writeFileMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.stringMatching(EMPTY_ENTRIES_PATTERN),
      'utf8'
    );
  });
});

describe('console diagnostics helpers', () => {
  it('detects authentication warnings gracefully', () => {
    const event = createConsoleEvent({ level: 'warn', args: ['401 Authentication required'] });
    expect(consoleEventIndicatesAuthIssue(event)).toBe(true);
  });

  it('flags runtime errors but ignores TRPC metadata logs', () => {
    expect(
      consoleEventIndicatesRuntimeError(
        createConsoleEvent({ level: 'warn', args: ['[trpc] warning', 'TRPCClientError'] })
      )
    ).toBe(false);
    expect(
      consoleEventIndicatesRuntimeError(
        createConsoleEvent({ level: 'error', args: ['Unhandled rejection occurred'] })
      )
    ).toBe(true);
  });

  it('formats console entries with ISO timestamps', () => {
    const summary = formatConsoleEventSummary(
      createConsoleEvent({ level: 'log', timestamp: Date.UTC(2024, 0, 1), args: ['hello', 'world'] })
    );
    expect(summary).toBe('[2024-01-01T00:00:00.000Z] log hello world');
  });
});

describe('misc helpers', () => {
  it('computes deterministic smoke route signatures', () => {
    const routes = ['a', 'b', 'c'];
    expect(computeSmokeRouteSignature(routes)).toBe(JSON.stringify(routes));
  });
});
