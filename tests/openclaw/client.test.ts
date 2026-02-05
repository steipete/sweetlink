import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROFILE_NOT_FOUND = /Profile not found/;
const STATUS_500 = /500 Internal Server Error/;

const fetchMock = vi.fn();
// @ts-expect-error -- global fetch override for testing
global.fetch = fetchMock;

const { OpenClawClient } = await import('../../src/openclaw/client');
const { OpenClawError } = await import('../../src/openclaw/types');

function mockOk(body: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

function mockError(status: number, body?: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status,
    statusText: 'Error',
    json: async () => body ?? { error: 'test error' },
  });
}

describe('OpenClawClient', () => {
  let client: InstanceType<typeof OpenClawClient>;

  beforeEach(() => {
    fetchMock.mockReset();
    client = new OpenClawClient({ url: 'http://127.0.0.1:18791', profile: 'test' });
  });

  describe('constructor validation', () => {
    it('rejects non-http protocols', () => {
      expect(() => new OpenClawClient({ url: 'file:///etc/passwd', profile: 'test' })).toThrow(OpenClawError);
      expect(() => new OpenClawClient({ url: 'ftp://evil.com', profile: 'test' })).toThrow(OpenClawError);
    });

    it('rejects invalid URLs with OpenClawError', () => {
      expect(() => new OpenClawClient({ url: 'not a url', profile: 'test' })).toThrow(OpenClawError);
      expect(() => new OpenClawClient({ url: '', profile: 'test' })).toThrow(OpenClawError);
    });

    it('accepts http and https', () => {
      expect(() => new OpenClawClient({ url: 'http://localhost:18791', profile: 'x' })).not.toThrow();
      expect(() => new OpenClawClient({ url: 'https://localhost:18791', profile: 'x' })).not.toThrow();
    });
  });

  describe('health', () => {
    it('returns health status from server', async () => {
      mockOk({ running: true, cdpReady: true });
      const result = await client.health({ skipCache: true });
      expect(result).toEqual({ running: true, cdpReady: true });
      expect(fetchMock).toHaveBeenCalledOnce();
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('profile=test');
    });

    it('caches health for subsequent calls', async () => {
      mockOk({ running: true, cdpReady: true });
      await client.health({ skipCache: true });
      const cached = await client.health();
      expect(cached).toEqual({ running: true, cdpReady: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('bypasses cache when skipCache is true', async () => {
      mockOk({ running: true, cdpReady: true });
      mockOk({ running: true, cdpReady: false });
      await client.health({ skipCache: true });
      const fresh = await client.health({ skipCache: true });
      expect(fresh).toEqual({ running: true, cdpReady: false });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('isReady', () => {
    it('returns true when running and cdpReady', async () => {
      mockOk({ running: true, cdpReady: true });
      expect(await client.isReady()).toBe(true);
    });

    it('returns false when not running', async () => {
      mockOk({ running: false, cdpReady: false });
      expect(await client.isReady()).toBe(false);
    });

    it('returns false on network error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      expect(await client.isReady()).toBe(false);
    });
  });

  describe('snapshot', () => {
    it('sends correct query parameters', async () => {
      const body = { ok: true, format: 'ai', targetId: 't1', url: 'http://example.com', snapshot: 'heading "Hi"' };
      mockOk(body);
      const result = await client.snapshot({ format: 'ai', interactive: true, labels: true });
      expect(result).toEqual(body);
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('format=ai');
      expect(url).toContain('interactive=true');
      expect(url).toContain('labels=true');
      expect(url).toContain('profile=test');
    });
  });

  describe('act', () => {
    it('posts click action with ref', async () => {
      const body = { ok: true, targetId: 't1', url: 'http://example.com' };
      mockOk(body);
      const result = await client.act({ kind: 'click', ref: 'e5' });
      expect(result).toEqual(body);
      const call = fetchMock.mock.calls[0];
      expect(call[1].method).toBe('POST');
      const parsed = JSON.parse(call[1].body as string);
      expect(parsed).toEqual({ kind: 'click', ref: 'e5' });
    });
  });

  describe('screenshot', () => {
    it('posts screenshot request', async () => {
      const body = { ok: true, path: '/tmp/shot.png', targetId: 't1', url: 'http://example.com' };
      mockOk(body);
      const result = await client.screenshot({ fullPage: true, type: 'png' });
      expect(result).toEqual(body);
    });
  });

  describe('navigate', () => {
    it('posts navigation request', async () => {
      mockOk({ ok: true, targetId: 't1', url: 'http://example.com/page' });
      const result = await client.navigate({ url: 'http://example.com/page' });
      expect(result.url).toBe('http://example.com/page');
    });

    it('rejects non-http protocols', async () => {
      await expect(client.navigate({ url: 'file:///etc/passwd' })).rejects.toThrow(OpenClawError);
      await expect(client.navigate({ url: 'javascript:alert(1)' })).rejects.toThrow(OpenClawError);
      await expect(client.navigate({ url: 'ftp://evil.com' })).rejects.toThrow(OpenClawError);
    });

    it('rejects invalid URLs', async () => {
      await expect(client.navigate({ url: 'not a url' })).rejects.toThrow(OpenClawError);
    });
  });

  describe('tabs', () => {
    it('returns tab list', async () => {
      const tabs = [{ targetId: 't1', title: 'Test', url: 'http://example.com' }];
      mockOk({ running: true, tabs });
      const result = await client.tabs();
      expect(result.tabs).toHaveLength(1);
    });

    it('opens a new tab', async () => {
      mockOk({ targetId: 't2', title: 'New', url: 'http://new.com' });
      const tab = await client.openTab('http://new.com');
      expect(tab.targetId).toBe('t2');
    });

    it('rejects non-http protocols for openTab', async () => {
      await expect(client.openTab('file:///etc/passwd')).rejects.toThrow(OpenClawError);
      await expect(client.openTab('javascript:alert(1)')).rejects.toThrow(OpenClawError);
    });

    it('closes a tab', async () => {
      mockOk({ ok: true });
      const result = await client.closeTab('t1');
      expect(result.ok).toBe(true);
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('/tabs/t1');
    });
  });

  describe('error handling', () => {
    it('throws OpenClawError with upstream message', async () => {
      mockError(404, { error: 'Profile not found' });
      await expect(client.snapshot()).rejects.toThrow(OpenClawError);
      mockError(404, { error: 'Profile not found' });
      await expect(client.snapshot()).rejects.toThrow(PROFILE_NOT_FOUND);
    });

    it('includes status code on error', async () => {
      mockError(503, { error: 'Server not started' });
      try {
        await client.snapshot();
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(OpenClawError);
        expect((error as InstanceType<typeof OpenClawError>).statusCode).toBe(503);
      }
    });

    it('falls back to status text when no error body', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('no json')),
      });
      await expect(client.snapshot()).rejects.toThrow(STATUS_500);
    });
  });
});
