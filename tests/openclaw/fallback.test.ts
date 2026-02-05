import { describe, expect, it, vi } from 'vitest';
import { OpenClawError } from '../../src/openclaw/types';
import { withOpenClawFallback } from '../../src/openclaw/fallback';

describe('withOpenClawFallback', () => {
  it('returns result on success', async () => {
    const result = await withOpenClawFallback(() => Promise.resolve('ok'), 'test');
    expect(result).toBe('ok');
  });

  it('returns null on 503 (server unavailable)', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await withOpenClawFallback(
      () => Promise.reject(new OpenClawError('down', 503)),
      'snapshot',
    );
    expect(result).toBeNull();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('OpenClaw unavailable'));
    spy.mockRestore();
  });

  it('returns null on 409 (browser not running)', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await withOpenClawFallback(
      () => Promise.reject(new OpenClawError('not running', 409)),
      'act',
    );
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it('returns null on ECONNREFUSED', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await withOpenClawFallback(
      () => Promise.reject(new Error('fetch failed: ECONNREFUSED')),
      'navigate',
    );
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it('re-throws non-connectivity errors', async () => {
    await expect(
      withOpenClawFallback(
        () => Promise.reject(new OpenClawError('bad request', 400)),
        'test',
      ),
    ).rejects.toThrow(OpenClawError);
  });

  it('re-throws non-OpenClaw errors', async () => {
    await expect(
      withOpenClawFallback(
        () => Promise.reject(new TypeError('unexpected')),
        'test',
      ),
    ).rejects.toThrow(TypeError);
  });
});
