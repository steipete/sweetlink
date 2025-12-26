import { fetchJson } from '../http.js';
import { describeAppForPrompt } from '../util/app-label.js';
import { extractEventMessage } from '../util/errors.js';
let cachedBootstrap = null;
let bootstrapPromise = null;
const normalizeOptionalString = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};
const resolveBootstrapUrl = (appBaseUrl, endpoint) => {
    try {
        return new URL(endpoint, appBaseUrl).toString();
    }
    catch {
        const base = appBaseUrl.endsWith('/') ? appBaseUrl.slice(0, -1) : appBaseUrl;
        const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        return `${base}${path}`;
    }
};
const normalizeFallback = (config) => {
    if (!config) {
        return null;
    }
    const loginPath = normalizeOptionalString(config.loginPath);
    const redirectParam = normalizeOptionalString(config.redirectParam);
    if (!loginPath) {
        return null;
    }
    return {
        adminApiKey: null,
        loginPath,
        redirectParam,
    };
};
const normalizeResponse = (raw, fallback) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return fallback;
    }
    const record = raw;
    const adminApiKey = normalizeOptionalString(record.adminApiKey);
    const loginPath = normalizeOptionalString(record.loginPath);
    const redirectParam = normalizeOptionalString(record.redirectParam);
    const merged = {
        adminApiKey: adminApiKey ?? fallback?.adminApiKey ?? null,
        loginPath: loginPath ?? fallback?.loginPath ?? null,
        redirectParam: redirectParam ?? fallback?.redirectParam ?? null,
    };
    if (!(merged.adminApiKey || merged.loginPath)) {
        return null;
    }
    return merged;
};
export async function loadDevBootstrap(config) {
    if (cachedBootstrap) {
        return cachedBootstrap;
    }
    if (bootstrapPromise) {
        return bootstrapPromise;
    }
    const fallback = normalizeFallback(config.devBootstrap);
    const endpoint = normalizeOptionalString(config.devBootstrap?.endpoint ?? null);
    if (!endpoint) {
        cachedBootstrap = fallback;
        return fallback;
    }
    bootstrapPromise = (async () => {
        try {
            const url = resolveBootstrapUrl(config.appBaseUrl, endpoint);
            const response = await fetchJson(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            return normalizeResponse(response, fallback);
        }
        catch (error) {
            const label = describeAppForPrompt(config.appLabel);
            console.warn(`[SweetLink CLI] Dev bootstrap request failed for ${label}: ${extractEventMessage(error)}`);
            return fallback;
        }
    })();
    const result = await bootstrapPromise;
    bootstrapPromise = null;
    cachedBootstrap = result;
    return result;
}
export function getCachedDevBootstrap() {
    return cachedBootstrap;
}
export function buildDevBootstrapLoginUrl(targetUrl) {
    if (!cachedBootstrap?.loginPath) {
        return null;
    }
    let target;
    try {
        target = new URL(targetUrl);
    }
    catch {
        return null;
    }
    const loginUrl = new URL(cachedBootstrap.loginPath, target.origin);
    const redirectParam = cachedBootstrap.redirectParam ?? 'redirect';
    const redirectValue = `${target.pathname}${target.search}${target.hash}`;
    loginUrl.searchParams.set(redirectParam, redirectValue);
    if (!loginUrl.searchParams.has('sweetlink')) {
        loginUrl.searchParams.set('sweetlink', 'auto');
    }
    return loginUrl.toString();
}
//# sourceMappingURL=dev-bootstrap.js.map