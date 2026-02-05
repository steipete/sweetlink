// ---------------------------------------------------------------------------
// OpenClaw browser-control HTTP client
// ---------------------------------------------------------------------------
import { OpenClawError } from './types.js';
const HEALTH_CACHE_TTL_MS = 5000;
const TRAILING_SLASHES = /\/+$/;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const ALLOWED_NAVIGATE_PROTOCOLS = new Set(['http:', 'https:']);
/** Sanitize URL for error messages — removes credentials to prevent leakage. */
function sanitizeUrlForError(url) {
    try {
        const parsed = new URL(url);
        // Remove username/password if present
        parsed.username = '';
        parsed.password = '';
        return parsed.toString();
    }
    catch {
        // If we can't parse it, truncate and indicate it's invalid
        const truncated = url.length > 50 ? `${url.slice(0, 50)}...` : url;
        return `(invalid URL: ${truncated})`;
    }
}
export class OpenClawClient {
    baseUrl;
    profile;
    healthCache = null;
    healthPending = null;
    constructor(config) {
        let parsed;
        try {
            parsed = new URL(config.url);
        }
        catch {
            throw new OpenClawError(`Invalid OpenClaw URL: ${sanitizeUrlForError(config.url)}`, 0);
        }
        if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
            throw new OpenClawError(`Unsupported OpenClaw URL protocol: ${parsed.protocol}`, 0);
        }
        this.baseUrl = config.url.replace(TRAILING_SLASHES, '');
        this.profile = config.profile;
    }
    // -- Health -----------------------------------------------------------------
    async health(options) {
        // skipCache: always fetch fresh, bypass deduplication
        if (options?.skipCache) {
            const result = await this.get('/', { profile: this.profile });
            this.healthCache = { result, fetchedAt: Date.now() };
            return result;
        }
        // Check cache
        if (this.healthCache) {
            const age = Date.now() - this.healthCache.fetchedAt;
            if (age < HEALTH_CACHE_TTL_MS) {
                return this.healthCache.result;
            }
        }
        // Deduplicate concurrent requests: return pending promise if one exists
        if (this.healthPending) {
            return this.healthPending;
        }
        // Start new request
        this.healthPending = this.fetchHealthInternal();
        try {
            return await this.healthPending;
        }
        finally {
            this.healthPending = null;
        }
    }
    async fetchHealthInternal() {
        const result = await this.get('/', { profile: this.profile });
        this.healthCache = { result, fetchedAt: Date.now() };
        return result;
    }
    async isReady() {
        try {
            const h = await this.health();
            return h.running && h.cdpReady;
        }
        catch {
            return false;
        }
    }
    // -- Snapshot ---------------------------------------------------------------
    async snapshot(params = {}) {
        const query = { profile: this.profile };
        if (params.format)
            query.format = params.format;
        if (params.mode)
            query.mode = params.mode;
        if (params.refs)
            query.refs = params.refs;
        if (params.interactive)
            query.interactive = 'true';
        if (params.compact)
            query.compact = 'true';
        if (params.depth !== undefined)
            query.depth = String(params.depth);
        if (params.maxChars !== undefined)
            query.maxChars = String(params.maxChars);
        if (params.labels)
            query.labels = 'true';
        if (params.selector)
            query.selector = params.selector;
        if (params.frame)
            query.frame = params.frame;
        if (params.targetId)
            query.targetId = params.targetId;
        return await this.get('/snapshot', query);
    }
    // -- Act --------------------------------------------------------------------
    async act(action) {
        return await this.post('/act', action, { profile: this.profile });
    }
    // -- Screenshot -------------------------------------------------------------
    async screenshot(params = {}) {
        return await this.post('/screenshot', params, { profile: this.profile });
    }
    // -- Navigate ---------------------------------------------------------------
    async navigate(params) {
        assertSafeNavigateUrl(params.url);
        return await this.post('/navigate', params, { profile: this.profile });
    }
    // -- Tabs -------------------------------------------------------------------
    async tabs() {
        return await this.get('/tabs', { profile: this.profile });
    }
    async openTab(url) {
        assertSafeNavigateUrl(url);
        return await this.post('/tabs/open', { url }, { profile: this.profile });
    }
    async focusTab(targetId) {
        return await this.post('/tabs/focus', { targetId }, { profile: this.profile });
    }
    async closeTab(targetId) {
        return await this.delete(`/tabs/${encodeURIComponent(targetId)}`, { profile: this.profile });
    }
    // -- PDF --------------------------------------------------------------------
    async pdf(targetId) {
        return await this.post('/pdf', targetId ? { targetId } : {}, { profile: this.profile });
    }
    // -- Dialog / File Upload ---------------------------------------------------
    async dialog(params) {
        return await this.post('/hooks/dialog', params, { profile: this.profile });
    }
    async fileUpload(params) {
        return await this.post('/hooks/file-chooser', params, { profile: this.profile });
    }
    // -- Internal HTTP helpers --------------------------------------------------
    async get(urlPath, query) {
        const url = this.buildUrl(urlPath, query);
        const response = await fetch(url);
        return await this.handleResponse(response);
    }
    async post(urlPath, body, query) {
        const url = this.buildUrl(urlPath, query);
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return await this.handleResponse(response);
    }
    async delete(urlPath, query) {
        const url = this.buildUrl(urlPath, query);
        const response = await fetch(url, { method: 'DELETE' });
        return await this.handleResponse(response);
    }
    buildUrl(urlPath, query) {
        const base = new URL(this.baseUrl);
        const url = new URL(urlPath, this.baseUrl);
        if (url.origin !== base.origin) {
            throw new OpenClawError(`Refusing request to different origin: ${url.origin}`, 0);
        }
        if (query) {
            for (const [key, value] of Object.entries(query)) {
                url.searchParams.set(key, value);
            }
        }
        return url.toString();
    }
    async handleResponse(response) {
        if (!response.ok) {
            const body = await safeJson(response);
            const upstream = body && typeof body === 'object' && 'error' in body
                ? String(body.error)
                : undefined;
            const detail = upstream ?? `${response.status} ${response.statusText}`;
            throw new OpenClawError(`OpenClaw request failed: ${detail}`, response.status, upstream);
        }
        return (await response.json());
    }
}
async function safeJson(response) {
    try {
        return await response.json();
    }
    catch {
        return null;
    }
}
function assertSafeNavigateUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        throw new OpenClawError(`Invalid navigation URL: ${sanitizeUrlForError(url)}`, 0);
    }
    if (!ALLOWED_NAVIGATE_PROTOCOLS.has(parsed.protocol)) {
        throw new OpenClawError(`Unsupported navigation URL protocol: ${parsed.protocol}`, 0);
    }
}
//# sourceMappingURL=client.js.map