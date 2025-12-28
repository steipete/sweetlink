import { regex } from 'arkregex';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compact, uniq } from 'es-toolkit';
import { loadSweetLinkFileConfig } from '../core/config-file.js';
import { sweetLinkDebug } from '../env.js';
import type { CliConfig } from '../types.js';
import { describeUnknown, isErrnoException } from '../util/errors.js';
import { delay } from '../util/time.js';
import {
  collectBootstrapDiagnostics,
  diagnosticsContainBlockingIssues,
  evaluateInDevToolsTab,
  type SweetLinkBootstrapDiagnostics,
} from './devtools.js';
import type { SweetLinkConsoleDump } from './session.js';
import { executeRunScriptCommand, fetchSessionSummaries, getSessionSummaryById } from './session.js';
import { buildWaitCandidateUrls, configurePathRedirects, urlsRoughlyMatch } from './url.js';

const ABSOLUTE_URL_PATTERN = regex.as('^https?:', 'i');

const normalizeRouteList = (input: unknown): string[] => {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }
  if (!Array.isArray(input)) {
    return [];
  }
  return compact(
    input.map((route) => {
      if (typeof route !== 'string') {
        return null;
      }
      const trimmed = route.trim();
      return trimmed.length > 0 ? trimmed : null;
    })
  );
};

const normalizeSmokePresets = (presets: Record<string, unknown> | undefined): Record<string, string[]> => {
  if (!presets || typeof presets !== 'object') {
    return {};
  }
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(presets)) {
    const routes = normalizeRouteList(value);
    if (routes.length > 0) {
      result[key] = routes;
    }
  }
  return result;
};

const SMOKE_PROGRESS_PATH = path.join(os.homedir(), '.sweetlink', 'smoke-progress.json');

type SmokeProgressEntry = {
  readonly baseOrigin: string;
  readonly routesSignature: string;
  readonly nextIndex: number;
  readonly updatedAt: number;
};

type SmokeProgressFile = {
  readonly entries: SmokeProgressEntry[];
};

const builtinSmokePresets = {
  main: ['timeline', 'insights', 'search', 'pulse'],
  settings: [
    'settings/account',
    'settings/activity',
    'settings/billing',
    'settings/notifications',
    'settings/social',
    'settings/sync',
    'settings/import',
    'settings/extension',
    'settings/beta',
  ],
  'billing-only': ['settings/billing'],
  'pulse-only': ['pulse'],
};

const { config: fileConfig } = loadSweetLinkFileConfig();
configurePathRedirects(fileConfig.redirects);

const configuredPresets = normalizeSmokePresets(fileConfig.smokeRoutes?.presets);

export const SMOKE_ROUTE_PRESETS: Record<string, string[]> = {
  ...builtinSmokePresets,
  ...configuredPresets,
};

const getPresetRoutes = (name: string): string[] => normalizeRouteList(SMOKE_ROUTE_PRESETS[name]);

const configuredDefaults = normalizeRouteList(fileConfig.smokeRoutes?.defaults ?? []);

const mainPresetRoutes: string[] = getPresetRoutes('main');
const settingsPresetRoutes: string[] = getPresetRoutes('settings');
const fallbackDefaults: string[] = [];
if (mainPresetRoutes.length > 0) {
  fallbackDefaults.push(...mainPresetRoutes);
} else {
  fallbackDefaults.push(...builtinSmokePresets.main);
}
if (settingsPresetRoutes.length > 0) {
  fallbackDefaults.push(...settingsPresetRoutes);
} else {
  fallbackDefaults.push(...builtinSmokePresets.settings);
}

export const DEFAULT_SMOKE_ROUTES = configuredDefaults.length > 0 ? configuredDefaults : fallbackDefaults;

export const deriveSmokeRoutes = (raw: string | undefined, defaults: readonly string[]): string[] => {
  if (!raw || raw.trim().length === 0) {
    return [...defaults];
  }
  const segments = compact(raw.split(',').map((segment) => segment.trim()));
  if (segments.length === 0) {
    return [...defaults];
  }
  const expanded = segments.flatMap((segment) => {
    const candidatePreset = SMOKE_ROUTE_PRESETS[segment.toLowerCase()];
    return Array.isArray(candidatePreset) ? candidatePreset : [segment];
  });
  const uniqueRoutes = uniq(expanded);
  return uniqueRoutes.length > 0 ? uniqueRoutes : [...defaults];
};

const normalizeRoutePath = (route: string): string => {
  const routeValue: string = typeof route === 'string' ? route : String(route ?? '');
  if (!routeValue) {
    return '/';
  }
  if (ABSOLUTE_URL_PATTERN.test(routeValue)) {
    try {
      const parsed = new URL(routeValue);
      return parsed.pathname || '/';
    } catch {
      return '/';
    }
  }
  const trimmed = String.prototype.trim.call(routeValue) as string;
  if (!trimmed) {
    return '/';
  }
  const withSlash = String.prototype.startsWith.call(trimmed, '/') ? trimmed : `/${trimmed}`;
  return withSlash.replaceAll(/\/{2,}/g, '/');
};

export const buildSmokeRouteUrl = (base: URL, route: string): URL => {
  if (ABSOLUTE_URL_PATTERN.test(route)) {
    try {
      const parsed = new URL(route);
      parsed.searchParams.set('sweetlink', 'auto');
      return parsed;
    } catch {
      // Fall back to treating as relative path.
    }
  }
  const [pathPart, searchPart] = route.split('?', 2);
  const next = new URL(base.toString());
  next.search = '';
  next.pathname = normalizeRoutePath(pathPart ?? '/');
  if (searchPart) {
    const extra = new URLSearchParams(searchPart);
    for (const [key, value] of extra.entries()) {
      next.searchParams.set(key, value);
    }
  }
  next.searchParams.set('sweetlink', 'auto');
  return next;
};

export const navigateSweetLinkSession = async (params: {
  sessionId: string;
  targetUrl: URL;
  config: CliConfig;
}): Promise<void> => {
  const script = `(() => {
    try {
      const target = new URL(${JSON.stringify(params.targetUrl.toString())}, window.location.origin);
      if (target.searchParams.get('sweetlink') !== 'auto') {
        target.searchParams.set('sweetlink', 'auto');
      }
      if (window.location.href === target.toString()) {
        return target.toString();
      }
      window.location.assign(target.toString());
      return target.toString();
    } catch (error) {
      throw new Error(String(error ?? 'navigation failed'));
    }
  })()`;

  await executeRunScriptCommand(params.config, {
    sessionId: params.sessionId,
    code: script,
    timeoutMs: 15_000,
    captureConsole: false,
  });
};

export const triggerSweetLinkCliAuto = async (devtoolsUrl: string, candidateUrl: string): Promise<void> => {
  const candidates = buildWaitCandidateUrls(candidateUrl);
  const expression = `(() => {
    try {
      if (typeof console?.log === 'function') {
        console.log('[SweetLink CLI] dispatching sweetlink:cli-auto event');
      }
      const event = new CustomEvent('sweetlink:cli-auto');
      window.dispatchEvent(event);
      try {
        window.sessionStorage?.setItem('sweetlink:auto', 'pending');
        window.sessionStorage?.removeItem('sweetlink:last-session');
      } catch {}
      try {
        window.localStorage?.removeItem('sweetlink:last-session');
      } catch {}
      return { dispatched: true };
    } catch (error) {
      return { dispatched: false, error: String(error ?? 'failed') };
    }
  })()`;

  for (const candidate of candidates) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: evaluate each candidate sequentially until one succeeds.
      await evaluateInDevToolsTab(devtoolsUrl, candidate, expression);
      break;
    } catch (error) {
      if (sweetLinkDebug) {
        console.warn('Failed to trigger SweetLink CLI auto bootstrap:', error);
      }
    }
  }
};

export const ensureSweetLinkSessionConnected = async (params: {
  config: CliConfig;
  token: string;
  sessionId: string;
  devtoolsUrl: string;
  currentUrl: string;
  timeoutMs?: number;
  onSessionIdChanged?: (nextSessionId: string) => void;
  candidateUrls?: string[];
}): Promise<boolean> => {
  const timeoutMs = params.timeoutMs ?? 15_000;
  const deadline = Date.now() + timeoutMs;
  let lastTriggerAt = 0;
  let activeSessionId = params.sessionId;
  const candidateSources = [params.currentUrl, ...(params.candidateUrls ?? [])];
  const candidateUrls = candidateSources.flatMap((source) => buildWaitCandidateUrls(source));

  while (Date.now() < deadline) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: polling for a session must remain sequential.
      const summary = await getSessionSummaryById(params.config, params.token, activeSessionId);
      if (summary && summary.socketState === 'open') {
        return true;
      }
      if (!summary) {
        const sessions = await fetchSessionSummaries(params.config, params.token);
        const replacement = sessions.find((candidate) => {
          if (!candidate?.url) {
            return false;
          }
          return candidateUrls.some((candidateUrl) => urlsRoughlyMatch(candidate.url, candidateUrl));
        });
        if (replacement) {
          activeSessionId = replacement.sessionId;
          params.onSessionIdChanged?.(replacement.sessionId);
          if (replacement.socketState === 'open') {
            return true;
          }
        }
      }
    } catch {
      /* ignore */
    }

    if (Date.now() - lastTriggerAt > 750) {
      await triggerSweetLinkCliAuto(params.devtoolsUrl, params.currentUrl);
      lastTriggerAt = Date.now();
    }

    await delay(500);
  }

  return false;
};

export const waitForSmokeRouteReady = async (params: {
  devtoolsUrl: string;
  targetUrl: URL;
  timeoutMs: number;
}): Promise<SweetLinkBootstrapDiagnostics | null> => {
  const candidates = buildWaitCandidateUrls(params.targetUrl.toString());
  const deadline = Date.now() + params.timeoutMs;
  let lastDiagnostics: SweetLinkBootstrapDiagnostics | null = null;

  while (Date.now() < deadline) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: retries rely on sequential collection attempts.
      const diagnostics = await collectBootstrapDiagnostics(params.devtoolsUrl, candidates);
      if (diagnostics) {
        lastDiagnostics = diagnostics;
        if (diagnosticsContainBlockingIssues(diagnostics)) {
          return diagnostics;
        }
        if (
          diagnostics.locationHref &&
          urlsRoughlyMatch(diagnostics.locationHref, params.targetUrl.toString()) &&
          diagnostics.readyState &&
          (diagnostics.readyState === 'complete' || diagnostics.readyState === 'interactive')
        ) {
          return diagnostics;
        }
      }
    } catch (error) {
      if (sweetLinkDebug) {
        console.warn('Smoke wait diagnostics error:', error);
      }
    }
    await delay(500);
  }

  return lastDiagnostics;
};

function routesSignatureKey(routes: readonly string[]): string {
  return JSON.stringify(routes);
}

async function readSmokeProgressFile(): Promise<SmokeProgressFile> {
  try {
    const raw = await readFile(SMOKE_PROGRESS_PATH, 'utf8');
    const parsed = JSON.parse(raw) as SmokeProgressFile;
    if (parsed && Array.isArray(parsed.entries)) {
      return {
        entries: parsed.entries
          .map((entry) => ({
            baseOrigin: entry.baseOrigin,
            routesSignature: entry.routesSignature,
            nextIndex: entry.nextIndex ?? 0,
            updatedAt: entry.updatedAt ?? Date.now(),
          }))
          .filter((entry) => typeof entry.baseOrigin === 'string' && typeof entry.routesSignature === 'string'),
      };
    }
  } catch (error) {
    if (!isErrnoException(error) || error.code !== 'ENOENT') {
      console.warn('Failed to read SweetLink smoke progress file:', error);
    }
  }
  return { entries: [] };
}

async function writeSmokeProgressFile(file: SmokeProgressFile): Promise<void> {
  const directory = path.dirname(SMOKE_PROGRESS_PATH);
  await mkdir(directory, { recursive: true });
  const payload = JSON.stringify({ entries: file.entries }, null, 2);
  await writeFile(SMOKE_PROGRESS_PATH, payload, 'utf8');
}

export function computeSmokeRouteSignature(routes: readonly string[]): string {
  return routesSignatureKey(routes);
}

export async function loadSmokeProgressIndex(baseOrigin: string, routes: readonly string[]): Promise<number | null> {
  const signature = routesSignatureKey(routes);
  const file = await readSmokeProgressFile();
  const match = file.entries.find((entry) => entry.baseOrigin === baseOrigin && entry.routesSignature === signature);
  if (match && Number.isInteger(match.nextIndex) && match.nextIndex >= 0) {
    return match.nextIndex;
  }
  return null;
}

export async function saveSmokeProgressIndex(
  baseOrigin: string,
  routes: readonly string[],
  nextIndex: number
): Promise<void> {
  const signature = routesSignatureKey(routes);
  const file = await readSmokeProgressFile();
  const now = Date.now();
  const existingIndex = file.entries.findIndex(
    (entry) => entry.baseOrigin === baseOrigin && entry.routesSignature === signature
  );
  if (existingIndex === -1) {
    file.entries.push({ baseOrigin, routesSignature: signature, nextIndex, updatedAt: now });
  } else {
    file.entries[existingIndex] = {
      baseOrigin,
      routesSignature: signature,
      nextIndex,
      updatedAt: now,
    };
  }
  await writeSmokeProgressFile(file);
}

export async function clearSmokeProgress(baseOrigin: string, routes: readonly string[]): Promise<void> {
  const signature = routesSignatureKey(routes);
  const file = await readSmokeProgressFile();
  const filtered = file.entries.filter(
    (entry) => !(entry.baseOrigin === baseOrigin && entry.routesSignature === signature)
  );
  if (filtered.length === file.entries.length) {
    return;
  }
  await writeSmokeProgressFile({ entries: filtered });
}

export const consoleEventIndicatesAuthIssue = (event: SweetLinkConsoleDump): boolean => {
  const level = typeof event?.level === 'string' ? event.level.toLowerCase() : '';
  if (level && level !== 'error' && level !== 'warn' && level !== 'assert') {
    return false;
  }
  if (!(event && Array.isArray(event.args))) {
    return false;
  }
  for (const value of event.args) {
    const text = describeUnknown(value, '').toLowerCase();
    if (!text) {
      continue;
    }
    if (text.includes('authentication required') || text.includes('unauthorized') || text.includes('401')) {
      return true;
    }
  }
  return false;
};

export const consoleEventIndicatesRuntimeError = (event: SweetLinkConsoleDump): boolean => {
  const level = typeof event?.level === 'string' ? event.level.toLowerCase() : '';
  const isErrorLevel = level === 'error' || level === 'assert';

  const args = Array.isArray(event?.args) ? event.args : [];

  const renderedArgs = args
    .map((value) => describeUnknown(value, ''))
    .filter((value) => typeof value === 'string' && value.trim().length > 0);

  if (renderedArgs.length === 0) {
    return isErrorLevel;
  }

  const combined = renderedArgs.join(' ').toLowerCase();

  if (combined.includes('[fast refresh]')) {
    return false;
  }

  const isTrpcMetadataLog = combined.includes('[trpc]') && combined.includes('trpcclienterror');
  if (isTrpcMetadataLog) {
    return false;
  }

  if (isErrorLevel) {
    return true;
  }

  if (level === 'warn') {
    if (combined.includes('[trpc]')) {
      return false;
    }
    return (
      combined.includes('uncaught') ||
      combined.includes('unhandled') ||
      combined.includes('sweetlink auto-activation failed') ||
      (combined.includes('error:') && !combined.includes('trpcclienterror'))
    );
  }

  if (!level || level === 'log' || level === 'info' || level === 'debug') {
    if (combined.includes('sweetlink auto-activation failed')) {
      return true;
    }
    if (combined.includes('uncaught') || combined.includes('unhandled')) {
      return true;
    }
    if (combined.includes('error:') && !combined.includes('trpcclienterror') && !combined.includes('[trpc]')) {
      return true;
    }
    return false;
  }

  return false;
};

export const formatConsoleEventSummary = (event: SweetLinkConsoleDump): string => {
  const timestamp = Number.isFinite(event.timestamp) ? new Date(event.timestamp).toISOString() : 'unknown-time';
  const message = event.args
    .map((value) => describeUnknown(value, ''))
    .join(' ')
    .trim();
  return `[${timestamp}] ${event.level ?? 'log'} ${message}`;
};
