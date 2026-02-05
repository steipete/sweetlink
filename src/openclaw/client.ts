// ---------------------------------------------------------------------------
// OpenClaw browser-control HTTP client
// ---------------------------------------------------------------------------

import type {
  OpenClawAction,
  OpenClawActionResponse,
  OpenClawConfig,
  OpenClawDialogParams,
  OpenClawFileUploadParams,
  OpenClawHealthResponse,
  OpenClawNavigateParams,
  OpenClawNavigateResponse,
  OpenClawPdfResponse,
  OpenClawScreenshotParams,
  OpenClawScreenshotResponse,
  OpenClawSnapshotParams,
  OpenClawSnapshotResponse,
  OpenClawTab,
  OpenClawTabsResponse,
} from './types.js';
import { OpenClawError } from './types.js';

const HEALTH_CACHE_TTL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds default timeout
const TRAILING_SLASHES = /\/+$/;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const ALLOWED_NAVIGATE_PROTOCOLS = new Set(['http:', 'https:']);

/** Sanitize URL for error messages — removes credentials to prevent leakage. */
function sanitizeUrlForError(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove username/password if present
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    // If we can't parse it, truncate and indicate it's invalid
    const truncated = url.length > 50 ? `${url.slice(0, 50)}...` : url;
    return `(invalid URL: ${truncated})`;
  }
}

interface CachedHealth {
  readonly result: OpenClawHealthResponse;
  readonly fetchedAt: number;
}

export class OpenClawClient {
  private readonly baseUrl: string;
  private readonly profile: string;
  private healthCache: CachedHealth | null = null;
  private healthPending: Promise<OpenClawHealthResponse> | null = null;

  constructor(config: Pick<OpenClawConfig, 'url' | 'profile'>) {
    let parsed: URL;
    try {
      parsed = new URL(config.url);
    } catch {
      throw new OpenClawError(`Invalid OpenClaw URL: ${sanitizeUrlForError(config.url)}`, 0);
    }
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      throw new OpenClawError(`Unsupported OpenClaw URL protocol: ${parsed.protocol}`, 0);
    }
    this.baseUrl = config.url.replace(TRAILING_SLASHES, '');
    this.profile = config.profile;
  }

  // -- Health -----------------------------------------------------------------

  async health(options?: { skipCache?: boolean }): Promise<OpenClawHealthResponse> {
    // skipCache: always fetch fresh, bypass deduplication
    if (options?.skipCache) {
      const result = await this.get<OpenClawHealthResponse>('/', { profile: this.profile });
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
    } finally {
      this.healthPending = null;
    }
  }

  private async fetchHealthInternal(): Promise<OpenClawHealthResponse> {
    const result = await this.get<OpenClawHealthResponse>('/', { profile: this.profile });
    this.healthCache = { result, fetchedAt: Date.now() };
    return result;
  }

  async isReady(): Promise<boolean> {
    try {
      const h = await this.health();
      return h.running && h.cdpReady;
    } catch {
      return false;
    }
  }

  // -- Snapshot ---------------------------------------------------------------

  async snapshot(params: OpenClawSnapshotParams = {}): Promise<OpenClawSnapshotResponse> {
    const query: Record<string, string> = { profile: this.profile };
    if (params.format) query.format = params.format;
    if (params.mode) query.mode = params.mode;
    if (params.refs) query.refs = params.refs;
    if (params.interactive) query.interactive = 'true';
    if (params.compact) query.compact = 'true';
    if (params.depth !== undefined) query.depth = String(params.depth);
    if (params.maxChars !== undefined) query.maxChars = String(params.maxChars);
    if (params.labels) query.labels = 'true';
    if (params.selector) query.selector = params.selector;
    if (params.frame) query.frame = params.frame;
    if (params.targetId) query.targetId = params.targetId;
    return await this.get<OpenClawSnapshotResponse>('/snapshot', query);
  }

  // -- Act --------------------------------------------------------------------

  async act(action: OpenClawAction): Promise<OpenClawActionResponse> {
    return await this.post<OpenClawActionResponse>('/act', action, { profile: this.profile });
  }

  // -- Screenshot -------------------------------------------------------------

  async screenshot(params: OpenClawScreenshotParams = {}): Promise<OpenClawScreenshotResponse> {
    return await this.post<OpenClawScreenshotResponse>('/screenshot', params, { profile: this.profile });
  }

  // -- Navigate ---------------------------------------------------------------

  async navigate(params: OpenClawNavigateParams): Promise<OpenClawNavigateResponse> {
    assertSafeNavigateUrl(params.url);
    return await this.post<OpenClawNavigateResponse>('/navigate', params, { profile: this.profile });
  }

  // -- Tabs -------------------------------------------------------------------

  async tabs(): Promise<OpenClawTabsResponse> {
    return await this.get<OpenClawTabsResponse>('/tabs', { profile: this.profile });
  }

  async openTab(url: string): Promise<OpenClawTab> {
    assertSafeNavigateUrl(url);
    return await this.post<OpenClawTab>('/tabs/open', { url }, { profile: this.profile });
  }

  async focusTab(targetId: string): Promise<{ ok: true }> {
    return await this.post<{ ok: true }>('/tabs/focus', { targetId }, { profile: this.profile });
  }

  async closeTab(targetId: string): Promise<{ ok: true }> {
    return await this.delete<{ ok: true }>(`/tabs/${encodeURIComponent(targetId)}`, { profile: this.profile });
  }

  // -- PDF --------------------------------------------------------------------

  async pdf(targetId?: string): Promise<OpenClawPdfResponse> {
    return await this.post<OpenClawPdfResponse>('/pdf', targetId ? { targetId } : {}, { profile: this.profile });
  }

  // -- Dialog / File Upload ---------------------------------------------------

  async dialog(params: OpenClawDialogParams): Promise<{ ok: true }> {
    return await this.post<{ ok: true }>('/hooks/dialog', params, { profile: this.profile });
  }

  async fileUpload(params: OpenClawFileUploadParams): Promise<{ ok: true }> {
    return await this.post<{ ok: true }>('/hooks/file-chooser', params, { profile: this.profile });
  }

  // -- Internal HTTP helpers --------------------------------------------------

  private async get<T>(urlPath: string, query?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(urlPath, query);
    const response = await this.fetchWithTimeout(url);
    return await this.handleResponse<T>(response);
  }

  private async post<T>(urlPath: string, body: unknown, query?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(urlPath, query);
    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await this.handleResponse<T>(response);
  }

  private async delete<T>(urlPath: string, query?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(urlPath, query);
    const response = await this.fetchWithTimeout(url, { method: 'DELETE' });
    return await this.handleResponse<T>(response);
  }

  private async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new OpenClawError(`Request timed out after ${DEFAULT_TIMEOUT_MS}ms`, 0);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildUrl(urlPath: string, query?: Record<string, string>): string {
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

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const body = await safeJson(response);
      const upstream =
        body && typeof body === 'object' && 'error' in body
          ? String((body as { error: unknown }).error)
          : undefined;
      const detail = upstream ?? `${response.status} ${response.statusText}`;
      throw new OpenClawError(`OpenClaw request failed: ${detail}`, response.status, upstream);
    }
    return (await response.json()) as T;
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function assertSafeNavigateUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new OpenClawError(`Invalid navigation URL: ${sanitizeUrlForError(url)}`, 0);
  }
  if (!ALLOWED_NAVIGATE_PROTOCOLS.has(parsed.protocol)) {
    throw new OpenClawError(`Unsupported navigation URL protocol: ${parsed.protocol}`, 0);
  }
}
