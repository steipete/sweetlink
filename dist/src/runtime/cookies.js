import { regex } from 'arkregex';
import { spawn } from 'node:child_process';
import { loadSweetLinkFileConfig } from '../core/config-file.js';
import { cloneProcessEnv } from '../core/env.js';
import { cliEnv } from '../env.js';
import { describeUnknown } from '../util/errors.js';
let tldPatchedForLocalhost;
let attemptedSqliteRebuild;
const PROTOCOL_PREFIX_PATTERN = regex.as('^[a-z]+://', 'i');
const LEADING_DOT_PATTERN = regex.as(String.raw `^\.`);
const SECURE_PREFIX_PATTERN = regex.as('^__Secure-');
const HOST_PREFIX_PATTERN = regex.as('^__Host-');
const SQLITE_NODE_PATTERN = regex.as(String.raw `node_sqlite3\.node`, 'i');
const SQLITE_BINDINGS_PATTERN = regex.as('bindings file', 'i');
const SQLITE_SELF_REGISTER_PATTERN = regex.as('Module did not self-register', 'i');
/** Collects cookies from the main Chrome profile matching the provided URL. */
export async function collectChromeCookies(targetUrl) {
    await ensureTldPatchedForLocalhost();
    const secureModule = await loadChromeCookiesModule();
    if (!secureModule) {
        return [];
    }
    const profileOverride = cliEnv.chromeProfilePath ?? undefined;
    const origins = buildCookieOrigins(targetUrl);
    const collected = new Map();
    const debugCookies = cliEnv.cookieDebug;
    const targetBaseUrl = new URL(targetUrl);
    if (debugCookies) {
        console.log('Cookie sync debug enabled.');
    }
    await Promise.all(origins.map((origin) => collectCookiesForOrigin({
        origin,
        secureModule,
        profileOverride,
        collected,
        debugCookies,
        targetBaseUrl,
    })));
    pruneIncompatibleCookies(targetBaseUrl, collected);
    return [...collected.values()];
}
/** Collects cookies for each domain and groups them by the originating host. */
export async function collectChromeCookiesForDomains(domains) {
    await ensureTldPatchedForLocalhost();
    const secureModule = await loadChromeCookiesModule();
    if (!secureModule) {
        return {};
    }
    const profileOverride = cliEnv.chromeProfilePath ?? undefined;
    const debugCookies = cliEnv.cookieDebug;
    const results = {};
    await Promise.all(domains.map(async (domainCandidate) => {
        if (!domainCandidate) {
            return;
        }
        const domain = domainCandidate;
        const origins = new Set(normalizeDomainToOrigins(domain));
        const hostCandidate = extractHostCandidate(domain);
        if (hostCandidate) {
            for (const extra of resolveConfiguredCookieOrigins(hostCandidate)) {
                origins.add(extra);
            }
        }
        const collected = new Map();
        const originList = [...origins.values()].filter((origin) => Boolean(origin));
        await Promise.all(originList.map((origin) => collectCookiesForOrigin({
            origin,
            secureModule,
            profileOverride,
            collected,
            debugCookies,
            targetBaseUrl: new URL(origin),
        })));
        const targetIterator = origins.values().next();
        const targetCandidate = targetIterator.done ? domain : targetIterator.value;
        const targetBase = targetCandidate ? tryParseUrl(targetCandidate) : null;
        if (targetBase) {
            pruneIncompatibleCookies(targetBase, collected);
        }
        results[domain] = [...collected.values()];
    }));
    return results;
}
/** Returns the full set of origins SweetLink cares about for authentication. */
export function buildCookieOrigins(targetUrl) {
    const base = new URL(targetUrl);
    const origins = new Set([base.origin]);
    const host = base.hostname.toLowerCase();
    for (const origin of resolveConfiguredCookieOrigins(host)) {
        origins.add(origin);
    }
    return [...origins];
}
async function collectCookiesForOrigin({ origin, secureModule, profileOverride, collected, debugCookies, targetBaseUrl, }) {
    const cookieOrigin = origin.endsWith('/') ? origin : `${origin}/`;
    let sourceBaseUrl = null;
    try {
        sourceBaseUrl = new URL(cookieOrigin);
    }
    catch {
        if (debugCookies) {
            console.log(`Skipping malformed cookie origin candidate ${cookieOrigin}`);
        }
        return;
    }
    const fallbackOrigins = deriveCookieOriginFallbacks(sourceBaseUrl);
    const attemptCookieRead = async (candidateOrigin, reason) => {
        if (debugCookies) {
            if (reason === 'primary') {
                console.log(`Reading Chrome cookies for ${candidateOrigin}`);
            }
            else {
                console.log(`Retrying cookie collection for ${cookieOrigin} using fallback ${candidateOrigin}`);
            }
        }
        try {
            let candidateBase = null;
            try {
                candidateBase = new URL(candidateOrigin);
            }
            catch {
                candidateBase = null;
            }
            if (!candidateBase) {
                return 'parse-error';
            }
            sourceBaseUrl = candidateBase;
            const beforeSize = collected.size;
            const raw = (await secureModule.getCookiesPromised(candidateOrigin, 'puppeteer', profileOverride));
            if (raw && raw.length > 0) {
                ingestChromeCookies({
                    rawCookies: raw,
                    sourceBaseUrl: candidateBase,
                    targetBaseUrl,
                    collected,
                    sourceOrigin: candidateOrigin,
                    debug: debugCookies,
                });
                return collected.size > beforeSize ? 'added' : 'empty';
            }
            return 'empty';
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('Could not parse domain from URI')) {
                if (reason === 'fallback' && debugCookies) {
                    console.log(`Fallback cookie origin ${candidateOrigin} also failed: ${message}`);
                }
                return 'parse-error';
            }
            if (reason === 'primary') {
                console.warn(`Failed to read cookies from Chrome for ${candidateOrigin}:`, message);
                console.warn('If this persists, ensure Chrome is running and you are logged in, then rerun the command.');
            }
            else if (debugCookies) {
                console.log(`Fallback cookie origin ${candidateOrigin} also failed: ${message}`);
            }
            return 'failed';
        }
    };
    const primaryResult = await attemptCookieRead(cookieOrigin, 'primary');
    const shouldAttemptFallback = fallbackOrigins.length > 0 && (primaryResult === 'empty' || primaryResult === 'parse-error');
    if (!shouldAttemptFallback) {
        if (primaryResult === 'parse-error' && debugCookies) {
            console.log(`Giving up on cookie sync for ${cookieOrigin}; chrome-cookies-secure cannot parse the host.`);
        }
        return;
    }
    let sawParseError = primaryResult === 'parse-error';
    for (const fallbackOrigin of fallbackOrigins) {
        // biome-ignore lint/performance/noAwaitInLoops: fallback attempts must run sequentially to stop on the first success.
        const result = await attemptCookieRead(fallbackOrigin, 'fallback');
        if (result === 'added') {
            return;
        }
        if (result === 'parse-error') {
            sawParseError = true;
        }
    }
    if (debugCookies) {
        const reasonMessage = sawParseError
            ? 'chrome-cookies-secure cannot parse the host.'
            : 'no cookies were found after fallback candidates.';
        console.log(`Giving up on cookie sync for ${cookieOrigin}; ${reasonMessage}`);
    }
}
function ingestChromeCookies({ rawCookies, sourceBaseUrl, targetBaseUrl, collected, sourceOrigin, debug, }) {
    if (!rawCookies?.length) {
        return;
    }
    for (const cookie of rawCookies) {
        if (debug) {
            console.log(`Saw cookie ${describeUnknown(cookie.name, 'unknown')} from ${sourceOrigin}`);
        }
        const mapped = normalizePuppeteerCookie(cookie, {
            sourceBase: sourceBaseUrl,
            targetBase: targetBaseUrl,
        });
        if (!mapped) {
            continue;
        }
        const key = `${mapped.domain ?? mapped.url ?? sourceBaseUrl.origin}|${mapped.path ?? '/'}|${mapped.name}`;
        if (!collected.has(key)) {
            collected.set(key, mapped);
        }
    }
    if (debug) {
        console.log(`${collected.size} cookies captured so far after ${sourceOrigin}`);
    }
}
function deriveCookieOriginFallbacks(baseUrl) {
    if (!baseUrl) {
        return [];
    }
    const protocol = baseUrl.protocol || 'https:';
    const host = baseUrl.hostname;
    if (!host) {
        return [];
    }
    const candidates = new Set();
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
function normalizeDomainToOrigins(domain) {
    const trimmed = domain.trim();
    if (!trimmed) {
        return [];
    }
    const candidates = new Set();
    const addCandidate = (value) => {
        try {
            const url = new URL(value);
            candidates.add(`${url.origin}/`);
        }
        catch {
            /* ignore malformed candidates */
        }
    };
    if (PROTOCOL_PREFIX_PATTERN.test(trimmed)) {
        addCandidate(trimmed);
    }
    else {
        addCandidate(`https://${trimmed}`);
        addCandidate(`http://${trimmed}`);
    }
    return [...candidates];
}
function extractHostCandidate(domain) {
    const trimmed = domain.trim();
    if (!trimmed) {
        return null;
    }
    try {
        const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
        return url.hostname.toLowerCase();
    }
    catch {
        return trimmed.toLowerCase();
    }
}
function resolveConfiguredCookieOrigins(host) {
    const { config } = loadSweetLinkFileConfig();
    const mappings = config.cookieMappings ?? [];
    const results = [];
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
function mappingMatchesHost(mapping, host) {
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
function isConfiguredCookieDomain(host) {
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
function isHostMatch(host, pattern) {
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
function normalizeOrigin(value) {
    try {
        const url = new URL(value);
        return url.origin;
    }
    catch {
        try {
            const url = new URL(`https://${value}`);
            return url.origin;
        }
        catch {
            return null;
        }
    }
}
export function normalizePuppeteerCookie(cookie, bases) {
    const originalName = typeof cookie.name === 'string' ? cookie.name : null;
    const value = typeof cookie.value === 'string' ? cookie.value : null;
    if (!originalName || value === null) {
        return null;
    }
    const result = {
        name: originalName,
        value,
    };
    const domain = typeof cookie.domain === 'string' && cookie.domain.length > 0 ? cookie.domain : null;
    const path = typeof cookie.path === 'string' && cookie.path.length > 0 ? cookie.path : '/';
    const targetHost = bases.targetBase.hostname;
    const isLocalTarget = targetHost === 'localhost' || targetHost === '127.0.0.1';
    const normalizedDomain = domain?.replace(LEADING_DOT_PATTERN, '') ?? null;
    const isConfiguredDomain = normalizedDomain ? isConfiguredCookieDomain(normalizedDomain) : false;
    const isLocalDomain = normalizedDomain === 'localhost' || normalizedDomain === '127.0.0.1' || normalizedDomain === '::1';
    if (isLocalTarget && result.name.startsWith('__Secure-better-auth.')) {
        result.name = result.name.replace(SECURE_PREFIX_PATTERN, '');
    }
    if (domain && domain !== 'localhost') {
        if (isLocalTarget && (isConfiguredDomain || isLocalDomain)) {
            result.url = bases.targetBase.origin;
        }
        else {
            result.domain = domain;
        }
    }
    else {
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
    const rehomedToTarget = typeof result.url === 'string' && result.url.length > 0 && result.url === bases.targetBase.origin;
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
function normalizeSameSite(value) {
    if (!value) {
        return;
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
    return;
}
function pruneIncompatibleCookies(targetBaseUrl, collected) {
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
function tryParseUrl(candidate) {
    try {
        return new URL(candidate);
    }
    catch {
        try {
            return new URL(candidate.includes('://') ? candidate : `http://${candidate}`);
        }
        catch {
            return null;
        }
    }
}
async function ensureTldPatchedForLocalhost() {
    if (tldPatchedForLocalhost) {
        return;
    }
    try {
        const importedModule = await import('tldjs');
        const tld = resolveTldModule(importedModule);
        if (tld && typeof tld.getDomain === 'function') {
            const originalGetDomain = tld.getDomain.bind(tld);
            tld.getDomain = (uri) => {
                const domain = originalGetDomain(uri);
                if (domain) {
                    return domain;
                }
                try {
                    return new URL(uri).hostname ?? null;
                }
                catch {
                    return null;
                }
            };
            tldPatchedForLocalhost = true;
        }
    }
    catch (error) {
        console.warn('Failed to patch tldjs for localhost support:', error);
    }
}
const SQLITE_BINDING_HINT = [
    'SweetLink needs chrome-cookies-secure to read your Chrome cookie DB.',
    'Rebuild the native modules once per workspace so Node 25 picks up the sqlite3 binding:',
    '  PYTHON=/usr/bin/python3 npm_config_build_from_source=1 pnpm rebuild chrome-cookies-secure sqlite3 keytar --workspace-root',
].join('\n');
const isSqliteBindingError = (error) => {
    if (!(error instanceof Error)) {
        return false;
    }
    const message = error.message ?? '';
    return (SQLITE_NODE_PATTERN.test(message) ||
        SQLITE_BINDINGS_PATTERN.test(message) ||
        SQLITE_SELF_REGISTER_PATTERN.test(message));
};
async function loadChromeCookiesModule() {
    let imported;
    try {
        imported = await import('chrome-cookies-secure');
    }
    catch (error) {
        console.warn('Failed to load chrome-cookies-secure to copy cookies:', error);
        if (isSqliteBindingError(error)) {
            const rebuilt = await attemptSqliteRebuild();
            if (rebuilt) {
                return loadChromeCookiesModule();
            }
            console.warn(SQLITE_BINDING_HINT);
        }
        else {
            console.warn('If this persists, run `pnpm rebuild chrome-cookies-secure sqlite3 keytar --workspace-root`.');
        }
        return null;
    }
    const secureModule = resolveChromeCookieModule(imported);
    if (!secureModule) {
        console.warn('chrome-cookies-secure does not expose getCookiesPromised(); skipping cookie copy.');
        return null;
    }
    return secureModule;
}
function resolveChromeCookieModule(candidate) {
    if (hasGetCookiesPromised(candidate)) {
        return candidate;
    }
    if (typeof candidate === 'object' && candidate !== null) {
        const defaultExport = Reflect.get(candidate, 'default');
        if (hasGetCookiesPromised(defaultExport)) {
            return defaultExport;
        }
    }
    return null;
}
function hasGetCookiesPromised(value) {
    return Boolean(value && typeof value.getCookiesPromised === 'function');
}
function resolveTldModule(value) {
    if (typeof value !== 'object' || value === null) {
        return null;
    }
    const record = value;
    if (typeof record.getDomain === 'function') {
        return record;
    }
    const defaultExport = record.default;
    if (typeof defaultExport === 'object' && defaultExport !== null) {
        const defaultRecord = defaultExport;
        if (typeof defaultRecord.getDomain === 'function') {
            return defaultRecord;
        }
    }
    return null;
}
function attemptSqliteRebuild() {
    if (attemptedSqliteRebuild) {
        return Promise.resolve(false);
    }
    attemptedSqliteRebuild = true;
    const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    const args = ['rebuild', 'chrome-cookies-secure', 'sqlite3', 'keytar', '--workspace-root'];
    const childEnv = cloneProcessEnv();
    const pythonBinary = childEnv.PYTHON ?? '/usr/bin/python3';
    const rebuildCommand = `${pnpmCommand} ${args.join(' ')}`;
    console.warn('[SweetLink] Attempting to rebuild sqlite3 bindings automatically…');
    console.warn(`[SweetLink] Running: npm_config_build_from_source=1 PYTHON=${pythonBinary} ${rebuildCommand}`);
    return new Promise((resolve) => {
        childEnv.npm_config_build_from_source = '1';
        childEnv.PYTHON = childEnv.PYTHON ?? '/usr/bin/python3';
        const child = spawn(pnpmCommand, args, {
            stdio: 'inherit',
            env: childEnv,
        });
        child.on('exit', (code) => {
            if (code === 0) {
                console.warn('[SweetLink] sqlite3 rebuild completed successfully.');
                resolve(true);
            }
            else {
                console.warn('[SweetLink] sqlite3 rebuild failed with exit code', code ?? 0);
                resolve(false);
            }
        });
        child.on('error', (spawnError) => {
            console.warn('[SweetLink] Unable to spawn pnpm to rebuild sqlite3:', spawnError);
            resolve(false);
        });
    });
}
//# sourceMappingURL=cookies.js.map