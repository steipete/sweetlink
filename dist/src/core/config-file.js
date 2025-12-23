import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { compact } from 'es-toolkit';
import { TRAILING_SLASH_PATTERN } from '../util/regex.js';
const CONFIG_BASENAMES = ['sweetlink.json', 'sweetlink.config.json'];
let cachedConfig = null;
export function resetSweetLinkFileConfigCache() {
    cachedConfig = null;
}
export function loadSweetLinkFileConfig() {
    if (cachedConfig) {
        return cachedConfig;
    }
    const resolvedPath = findConfigPath(process.cwd());
    if (!resolvedPath) {
        cachedConfig = { path: null, config: {} };
        return cachedConfig;
    }
    try {
        const raw = readFileSync(resolvedPath, 'utf8');
        const parsed = JSON.parse(raw);
        const baseDirectory = path.dirname(resolvedPath);
        const config = normalizeConfig(parsed, baseDirectory);
        cachedConfig = { path: resolvedPath, config };
        return cachedConfig;
    }
    catch (error) {
        console.warn(`[sweetlink] Failed to read configuration from ${resolvedPath}:`, error instanceof Error ? error.message : error);
        cachedConfig = { path: resolvedPath, config: {} };
        return cachedConfig;
    }
}
function findConfigPath(initialDirectory) {
    let current = initialDirectory;
    while (current) {
        for (const basename of CONFIG_BASENAMES) {
            const candidate = path.join(current, basename);
            if (existsSync(candidate)) {
                return candidate;
            }
        }
        const parent = path.dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }
    return null;
}
function normalizeConfig(raw, baseDirectory) {
    const config = {};
    if (typeof raw.appLabel === 'string') {
        const trimmed = raw.appLabel.trim();
        if (trimmed.length > 0) {
            config.appLabel = trimmed;
        }
    }
    if (typeof raw.appUrl === 'string') {
        const trimmed = raw.appUrl.trim();
        if (trimmed.length > 0) {
            config.appUrl = trimmed;
        }
    }
    if (typeof raw.prodUrl === 'string') {
        const trimmed = raw.prodUrl.trim();
        if (trimmed.length > 0) {
            config.prodUrl = trimmed;
        }
    }
    if (typeof raw.daemonUrl === 'string') {
        const trimmed = raw.daemonUrl.trim();
        if (trimmed.length > 0) {
            config.daemonUrl = trimmed;
        }
    }
    if (typeof raw.adminKey === 'string') {
        const trimmed = raw.adminKey.trim();
        if (trimmed.length > 0) {
            config.adminKey = trimmed;
        }
    }
    if (typeof raw.port === 'number' && Number.isFinite(raw.port) && raw.port > 0) {
        config.port = Math.floor(raw.port);
    }
    const cookieMappings = normalizeCookieMappingsSection(raw.cookieMappings);
    if (cookieMappings.length > 0) {
        config.cookieMappings = cookieMappings;
    }
    const healthChecks = normalizeHealthChecksSection(raw.healthChecks);
    if (healthChecks) {
        config.healthChecks = healthChecks;
    }
    const smokeRoutes = normalizeSmokeRoutesSection(raw.smokeRoutes);
    if (smokeRoutes) {
        config.smokeRoutes = smokeRoutes;
    }
    const redirects = normalizeRedirectsSection(raw.redirects);
    if (redirects) {
        config.redirects = redirects;
    }
    const servers = normalizeServersSection(raw.servers, baseDirectory);
    if (servers.length > 0) {
        config.servers = servers;
    }
    if (typeof raw.oauthScript === 'string') {
        const trimmed = raw.oauthScript.trim();
        if (trimmed.length > 0) {
            const resolved = resolveConfigPath(trimmed, baseDirectory);
            config.oauthScript = resolved;
        }
    }
    return config;
}
function resolveConfigPath(candidate, baseDirectory) {
    if (path.isAbsolute(candidate)) {
        return candidate;
    }
    const base = baseDirectory ?? process.cwd();
    return path.resolve(base, candidate);
}
function normalizeStringArray(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? [trimmed] : [];
    }
    if (!Array.isArray(value)) {
        return [];
    }
    return compact(value.map((item) => {
        if (typeof item !== 'string') {
            return null;
        }
        const trimmed = item.trim();
        return trimmed.length > 0 ? trimmed : null;
    }));
}
function normalizeCookieMappingsSection(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return compact(value.map((entry) => {
        if (!entry || typeof entry !== 'object') {
            return null;
        }
        const hostsRaw = normalizeStringArray(entry.hosts ?? entry.match);
        const originsRaw = normalizeStringArray(entry.origins ?? entry.include);
        if (hostsRaw.length === 0 || originsRaw.length === 0) {
            return null;
        }
        return {
            hosts: hostsRaw.map((host) => host.toLowerCase()),
            origins: originsRaw,
        };
    }));
}
function normalizeHealthChecksSection(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const paths = normalizeStringArray(value.paths ?? value.path);
    return paths.length > 0 ? { paths } : null;
}
function normalizeSmokeRoutesSection(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const defaults = normalizeStringArray(value.defaults);
    const rawPresets = value.presets;
    const normalizedPresets = rawPresets && typeof rawPresets === 'object'
        ? Object.fromEntries(compact(Object.entries(rawPresets).map(([key, routeList]) => {
            const routes = normalizeStringArray(routeList);
            return routes.length > 0 ? [key, routes] : null;
        })))
        : {};
    const hasDefaults = defaults.length > 0;
    const hasPresets = Object.keys(normalizedPresets).length > 0;
    if (!(hasDefaults || hasPresets)) {
        return null;
    }
    const config = {
        ...(hasDefaults ? { defaults } : {}),
        ...(hasPresets ? { presets: normalizedPresets } : {}),
    };
    return config;
}
function normalizeServersSection(value, baseDirectory) {
    if (!Array.isArray(value)) {
        return [];
    }
    return compact(value.map((entry) => {
        if (!entry || typeof entry !== 'object') {
            return null;
        }
        const record = entry;
        const envCandidate = typeof record.env === 'string' ? record.env.trim() : '';
        if (!envCandidate) {
            return null;
        }
        const startCommand = normalizeCommandArray(record.start);
        const checkCommand = normalizeCommandArray(record.check);
        const timeoutMs = normalizeTimeout(record.timeoutMs);
        const cwdRaw = typeof record.cwd === 'string' ? record.cwd.trim() : '';
        const cwdResolved = cwdRaw.length > 0 ? resolveConfigPath(cwdRaw, baseDirectory) : (baseDirectory ?? process.cwd());
        return {
            env: envCandidate,
            ...(startCommand ? { start: startCommand } : {}),
            ...(checkCommand ? { check: checkCommand } : {}),
            ...(cwdResolved ? { cwd: cwdResolved } : {}),
            ...(typeof timeoutMs === 'number' ? { timeoutMs } : {}),
        };
    }));
}
function normalizeCommandArray(value) {
    if (!value) {
        return null;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
            return null;
        }
        return ['sh', '-c', trimmed];
    }
    if (!Array.isArray(value)) {
        return null;
    }
    const command = compact(value.map((item) => {
        if (typeof item !== 'string') {
            return null;
        }
        const trimmed = item.trim();
        return trimmed.length > 0 ? trimmed : null;
    }));
    return command.length > 0 ? command : null;
}
function normalizeTimeout(value) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.floor(value);
    }
    if (typeof value === 'string') {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return null;
}
function canonicalizeRedirectPath(value) {
    if (typeof value !== 'string') {
        return null;
    }
    let normalized = value.trim();
    if (!normalized.startsWith('/')) {
        normalized = `/${normalized}`;
    }
    normalized = normalized.replace(TRAILING_SLASH_PATTERN, '');
    if (!normalized) {
        return '/';
    }
    return normalized || '/';
}
function normalizeRedirectsSection(value) {
    if (!value || typeof value !== 'object') {
        return;
    }
    const entries = Object.entries(value);
    if (entries.length === 0) {
        return;
    }
    const redirects = {};
    for (const [rawSource, rawTarget] of entries) {
        if (typeof rawSource !== 'string' || typeof rawTarget !== 'string') {
            continue;
        }
        const sourcePath = canonicalizeRedirectPath(rawSource);
        const targetPath = canonicalizeRedirectPath(rawTarget);
        if (!(sourcePath && targetPath)) {
            continue;
        }
        redirects[sourcePath] = targetPath;
    }
    return Object.keys(redirects).length > 0 ? redirects : undefined;
}
//# sourceMappingURL=config-file.js.map