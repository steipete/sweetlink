import { regex } from 'arkregex';
import { getCookies, type Cookie } from '@steipete/sweet-cookie';
import { loadSweetLinkFileConfig, type SweetLinkCookieMapping } from '../core/config-file.js';
import { cliEnv } from '../env.js';
import { describeUnknown } from '../util/errors.js';

export interface PuppeteerCookieParam {
  name: string;
  value: string;
  url?: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  expires?: number;
}

let tldPatchedForLocalhost: boolean | undefined;

const PROTOCOL_PREFIX_PATTERN = regex.as('^[a-z]+://', 'i');
const LEADING_DOT_PATTERN = regex.as(String.raw`^\.`);
const SECURE_PREFIX_PATTERN = regex.as('^__Secure-');
const HOST_PREFIX_PATTERN = regex.as('^__Host-');

/** Collects cookies from the main Chrome profile matching the provided URL. */
export async function collectChromeCookies(targetUrl: string): Promise<PuppeteerCookieParam[]> {
  await ensureTldPatchedForLocalhost();

  const debugCookies = cliEnv.cookieDebug;
  if (debugCookies) {
    console.log('Cookie sync debug enabled.');
  }

  const origins = buildCookieOrigins(targetUrl);
  const expandedOrigins = expandCookieOriginsForFallbacks(origins);
  const targetBaseUrl = new URL(targetUrl);

  const { cookies, warnings } = await getCookies({
    url: targetUrl,
    origins: expandedOrigins,
    browsers: ['chrome'],
    chromeProfile: cliEnv.chromeProfilePath ?? undefined,
    debug: debugCookies,
    oracleInlineFallback: true,
    mode: 'first',
  });

  if (debugCookies && warnings.length > 0) {
    for (const warning of warnings) {
      console.warn('[SweetLink] Cookie warning:', warning);
    }
  }

  const collected = new Map<string, PuppeteerCookieParam>();
  ingestSweetCookieCookies({
    cookies,
    targetBaseUrl,
    collected,
    debug: debugCookies,
  });
  pruneIncompatibleCookies(targetBaseUrl, collected);

  return [...collected.values()];
}

/** Collects cookies for each domain and groups them by the originating host. */
export async function collectChromeCookiesForDomains(
  domains: readonly (string | undefined)[]
): Promise<Record<string, PuppeteerCookieParam[]>> {
  await ensureTldPatchedForLocalhost();
  const debugCookies = cliEnv.cookieDebug;
  const results: Record<string, PuppeteerCookieParam[]> = {};

  for (const domainCandidate of domains) {
    if (!domainCandidate) {
      continue;
    }
    const domain = domainCandidate;
    const origins = new Set<string>(normalizeDomainToOrigins(domain));
    const hostCandidate = extractHostCandidate(domain);
    if (hostCandidate) {
      for (const extra of resolveConfiguredCookieOrigins(hostCandidate)) {
        origins.add(extra);
      }
    }
    const expandedOrigins = expandCookieOriginsForFallbacks([...origins.values()]);
    const collected = new Map<string, PuppeteerCookieParam>();
    const targetIterator = origins.values().next();
    const targetCandidate = targetIterator.done ? domain : targetIterator.value;
    const targetBase = targetCandidate ? tryParseUrl(targetCandidate) : null;
    const targetBaseUrl = targetBase ?? (targetCandidate ? tryParseUrl(`https://${targetCandidate}`) : null);

    if (targetCandidate && targetBaseUrl) {
      // biome-ignore lint/performance/noAwaitInLoops: cookie reads should stay sequential for predictable prompts/logging.
      const { cookies, warnings } = await getCookies({
        url: targetCandidate,
        origins: expandedOrigins,
        browsers: ['chrome'],
        chromeProfile: cliEnv.chromeProfilePath ?? undefined,
        debug: debugCookies,
        oracleInlineFallback: true,
        mode: 'first',
      });

      if (debugCookies && warnings.length > 0) {
        for (const warning of warnings) {
          console.warn('[SweetLink] Cookie warning:', warning);
        }
      }

      ingestSweetCookieCookies({
        cookies,
        targetBaseUrl,
        collected,
        debug: debugCookies,
      });
    }
    if (targetBase) {
      pruneIncompatibleCookies(targetBase, collected);
    }
    results[domain] = [...collected.values()];
  }

  return results;
}

/** Returns the full set of origins SweetLink cares about for authentication. */
export function buildCookieOrigins(targetUrl: string): string[] {
  const base = new URL(targetUrl);
  const origins = new Set<string>([base.origin]);
  const host = base.hostname.toLowerCase();

  for (const origin of resolveConfiguredCookieOrigins(host)) {
    origins.add(origin);
  }

  return [...origins];
}

interface IngestSweetCookieCookiesOptions {
  cookies: readonly Cookie[];
  targetBaseUrl: URL;
  collected: Map<string, PuppeteerCookieParam>;
  debug: boolean;
}

function ingestSweetCookieCookies({
  cookies,
  targetBaseUrl,
  collected,
  debug,
}: IngestSweetCookieCookiesOptions): void {
  if (!cookies?.length) {
    return;
  }
  for (const cookie of cookies) {
    if (debug) {
      console.log(`Saw cookie ${describeUnknown(cookie.name, 'unknown')} from Sweet Cookie`);
    }
    const mapped = normalizePuppeteerCookie(sweetCookieToChromeCookieRecord(cookie), {
      sourceBase: resolveCookieSourceBase(cookie, targetBaseUrl),
      targetBase: targetBaseUrl,
    });
    if (!mapped) {
      continue;
    }
    const key = `${mapped.domain ?? mapped.url ?? targetBaseUrl.origin}|${mapped.path ?? '/'}|${mapped.name}`;
    if (!collected.has(key)) {
      collected.set(key, mapped);
    }
  }
  if (debug) {
    console.log(`${collected.size} cookies captured so far`);
  }
}

function deriveCookieOriginFallbacks(baseUrl: URL | null): string[] {
  if (!baseUrl) {
    return [];
  }
  const protocol = baseUrl.protocol || 'https:';
  const host = baseUrl.hostname;
  if (!host) {
    return [];
  }
  const candidates = new Set<string>();
  const originWithSlash = `${protocol}//${host}/`;
  if (host === 'localhost' || host === '127.0.0.1') {
    candidates.add(originWithSlash);
    candidates.add('http://localhost/');
    candidates.add('http://127.0.0.1/');
    candidates.add('https://localhost/');
    candidates.add('https://127.0.0.1/');
    if (host === 'localhost') {
      candidates.add(`${protocol}//${host}.localdomain/`);
    }
  }
  candidates.delete(`${baseUrl.origin}/`);
  return [...candidates];
}

function expandCookieOriginsForFallbacks(origins: readonly string[]): string[] {
  const expanded = new Set<string>();
  for (const origin of origins) {
    expanded.add(origin);
    const base = tryParseUrl(origin.endsWith('/') ? origin : `${origin}/`);
    if (!base) {
      continue;
    }
    for (const fallback of deriveCookieOriginFallbacks(base)) {
      expanded.add(fallback);
    }
  }
  return [...expanded.values()];
}

function normalizeDomainToOrigins(domain: string): string[] {
  const trimmed = domain.trim();
  if (!trimmed) {
    return [];
  }
  const candidates = new Set<string>();
  const addCandidate = (value: string) => {
    try {
      const url = new URL(value);
      candidates.add(`${url.origin}/`);
    } catch {
      /* ignore malformed candidates */
    }
  };
  if (PROTOCOL_PREFIX_PATTERN.test(trimmed)) {
    addCandidate(trimmed);
  } else {
    addCandidate(`https://${trimmed}`);
    addCandidate(`http://${trimmed}`);
  }
  return [...candidates];
}

function extractHostCandidate(domain: string): string | null {
  const trimmed = domain.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return url.hostname.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

function resolveConfiguredCookieOrigins(host: string): string[] {
  const { config } = loadSweetLinkFileConfig();
  const mappings = config.cookieMappings ?? [];
  const results: string[] = [];
  for (const mapping of mappings) {
    if (mappingMatchesHost(mapping, host)) {
      for (const origin of mapping.origins) {
        const normalized = normalizeOrigin(origin);
        if (normalized) {
          results.push(normalized);
        }
      }
    }
  }
  return results;
}

function mappingMatchesHost(mapping: SweetLinkCookieMapping, host: string): boolean {
  for (const candidate of mapping.hosts) {
    const extracted = extractHostCandidate(candidate);
    if (!extracted) {
      continue;
    }
    if (isHostMatch(host, extracted)) {
      return true;
    }
  }
  return false;
}

function isConfiguredCookieDomain(host: string): boolean {
  const normalizedHost = host.toLowerCase();
  const { config } = loadSweetLinkFileConfig();
  const mappings = config.cookieMappings ?? [];
  for (const mapping of mappings) {
    if (mappingMatchesHost(mapping, normalizedHost)) {
      return true;
    }
  }
  return false;
}

function isHostMatch(host: string, pattern: string): boolean {
  const normalizedHost = host.toLowerCase();
  let normalizedPattern = pattern.toLowerCase();
  if (normalizedPattern.startsWith('*.')) {
    normalizedPattern = normalizedPattern.slice(2);
  }
  if (!normalizedPattern) {
    return false;
  }
  if (normalizedHost === normalizedPattern) {
    return true;
  }
  if (normalizedHost.endsWith(`.${normalizedPattern}`)) {
    return true;
  }
  return false;
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    try {
      const url = new URL(`https://${value}`);
      return url.origin;
    } catch {
      return null;
    }
  }
}

export function normalizePuppeteerCookie(
  cookie: Record<string, unknown>,
  bases: { sourceBase: URL; targetBase: URL }
): PuppeteerCookieParam | null {
  const originalName = typeof cookie.name === 'string' ? cookie.name : null;
  const value = typeof cookie.value === 'string' ? cookie.value : null;
  if (!originalName || value === null) {
    return null;
  }

  const result: PuppeteerCookieParam = {
    name: originalName,
    value,
  };

  const domain = typeof cookie.domain === 'string' && cookie.domain.length > 0 ? cookie.domain : null;
  const path = typeof cookie.path === 'string' && cookie.path.length > 0 ? cookie.path : '/';
  const targetHost = bases.targetBase.hostname;
  const isLocalTarget = targetHost === 'localhost' || targetHost === '127.0.0.1';
  const normalizedDomain = domain?.replace(LEADING_DOT_PATTERN, '') ?? null;
  const isConfiguredDomain = normalizedDomain ? isConfiguredCookieDomain(normalizedDomain) : false;
  const isLocalDomain =
    normalizedDomain === 'localhost' || normalizedDomain === '127.0.0.1' || normalizedDomain === '::1';

  if (isLocalTarget && result.name.startsWith('__Secure-better-auth.')) {
    result.name = result.name.replace(SECURE_PREFIX_PATTERN, '');
  }

  if (domain && domain !== 'localhost') {
    if (isLocalTarget && (isConfiguredDomain || isLocalDomain)) {
      result.url = bases.targetBase.origin;
    } else {
      result.domain = domain;
    }
  } else {
    result.url = bases.targetBase.origin;
  }

  if (path) {
    result.path = path;
  }

  if (cookie.Secure === true || cookie.secure === true) {
    result.secure = true;
  }
  if (cookie.HttpOnly === true || cookie.httpOnly === true) {
    result.httpOnly = true;
  }

  const sameSiteSource = typeof cookie.sameSite === 'string' ? cookie.sameSite : undefined;
  const sameSite = normalizeSameSite(sameSiteSource);
  if (sameSite) {
    result.sameSite = sameSite;
  }
  if (sameSite === 'None' && !result.secure) {
    result.secure = true;
  }

  if (typeof cookie.expires === 'number' && Number.isFinite(cookie.expires) && cookie.expires > 0) {
    result.expires = Math.round(cookie.expires);
  }

  const rehomedToTarget =
    typeof result.url === 'string' && result.url.length > 0 && result.url === bases.targetBase.origin;
  if (rehomedToTarget && bases.targetBase.protocol === 'http:') {
    if (result.secure) {
      result.secure = false;
    }
    if (result.sameSite === 'None') {
      result.sameSite = 'Lax';
    }
    if (result.name.startsWith('__Secure-')) {
      result.name = result.name.replace(SECURE_PREFIX_PATTERN, '');
    }
    if (result.name.startsWith('__Host-')) {
      result.name = result.name.replace(HOST_PREFIX_PATTERN, '');
      result.path = '/';
    }
  }

  return result;
}

function normalizeSameSite(value?: string): 'Strict' | 'Lax' | 'None' | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (normalized === 'strict') {
    return 'Strict';
  }
  if (normalized === 'lax') {
    return 'Lax';
  }
  if (normalized === 'no_restriction' || normalized === 'none') {
    return 'None';
  }
  return undefined;
}

function pruneIncompatibleCookies(targetBaseUrl: URL, collected: Map<string, PuppeteerCookieParam>): void {
  if (collected.size === 0) {
    return;
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!localHosts.has(targetBaseUrl.hostname)) {
    return;
  }

  const disallowedNames = new Set(['_vercel_session', '_vercel_jwt']);

  for (const [key, cookie] of collected.entries()) {
    const name = cookie.name?.toLowerCase();
    if (name && disallowedNames.has(name)) {
      collected.delete(key);
    }
  }
}

function tryParseUrl(candidate: string): URL | null {
  try {
    return new URL(candidate);
  } catch {
    try {
      return new URL(candidate.includes('://') ? candidate : `http://${candidate}`);
    } catch {
      return null;
    }
  }
}

async function ensureTldPatchedForLocalhost(): Promise<void> {
  if (tldPatchedForLocalhost) {
    return;
  }
  try {
    const importedModule: unknown = await import('tldjs');
    const tld = resolveTldModule(importedModule);
    if (tld && typeof tld.getDomain === 'function') {
      const originalGetDomain = tld.getDomain.bind(tld);
      tld.getDomain = (uri: string): string | null => {
        const domain = originalGetDomain(uri);
        if (domain) {
          return domain;
        }
        try {
          return new URL(uri).hostname ?? null;
        } catch {
          return null;
        }
      };
      tldPatchedForLocalhost = true;
    }
  } catch (error) {
    console.warn('Failed to patch tldjs for localhost support:', error);
  }
}

function sweetCookieToChromeCookieRecord(cookie: Cookie): Record<string, unknown> {
  const record: Record<string, unknown> = {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    expires: cookie.expires,
  };
  return record;
}

function resolveCookieSourceBase(cookie: Cookie, fallback: URL): URL {
  const origin = cookie.source?.origin;
  if (typeof origin === 'string' && origin.length > 0) {
    try {
      return new URL(origin);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

type TldModuleWithGetDomain = { getDomain: (uri: string) => string | null };

function resolveTldModule(value: unknown): TldModuleWithGetDomain | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.getDomain === 'function') {
    return record as TldModuleWithGetDomain;
  }
  const defaultExport = record.default;
  if (typeof defaultExport === 'object' && defaultExport !== null) {
    const defaultRecord = defaultExport as Record<string, unknown>;
    if (typeof defaultRecord.getDomain === 'function') {
      return defaultRecord as TldModuleWithGetDomain;
    }
  }
  return null;
}
