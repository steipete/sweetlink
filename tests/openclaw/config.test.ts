import { describe, expect, it } from 'vitest';
import { OPENCLAW_DEFAULTS } from '../../src/openclaw/types';
import { resolveOpenClawConfig } from '../../src/openclaw/config';

describe('resolveOpenClawConfig', () => {
  it('returns defaults when no file config is provided', () => {
    const config = resolveOpenClawConfig({});
    expect(config.enabled).toBe(false);
    expect(config.url).toBe(OPENCLAW_DEFAULTS.url);
    expect(config.profile).toBe(OPENCLAW_DEFAULTS.profile);
    expect(config.snapshotFormat).toBe('ai');
    expect(config.refs).toBe('role');
    expect(config.efficient).toBe(false);
  });

  it('merges file config over defaults', () => {
    const config = resolveOpenClawConfig({
      enabled: true,
      url: 'http://custom:9999',
      profile: 'myprofile',
      snapshotFormat: 'aria',
      refs: 'aria',
      efficient: true,
    });
    expect(config.enabled).toBe(true);
    expect(config.url).toBe('http://custom:9999');
    expect(config.profile).toBe('myprofile');
    expect(config.snapshotFormat).toBe('aria');
    expect(config.refs).toBe('aria');
    expect(config.efficient).toBe(true);
  });

  it('ignores invalid snapshotFormat values', () => {
    const config = resolveOpenClawConfig({ snapshotFormat: 'invalid' });
    expect(config.snapshotFormat).toBe('ai');
  });

  it('ignores invalid refs values', () => {
    const config = resolveOpenClawConfig({ refs: 'invalid' });
    expect(config.refs).toBe('role');
  });
});
