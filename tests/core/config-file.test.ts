import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSweetLinkFileConfig, resetSweetLinkFileConfigCache } from '../../src/core/config-file';

const noop = () => {
  /* suppress console noise */
};

const ORIGINAL_CWD = process.cwd();

let workingDir: string | null = null;

describe('core/config-file', () => {
  beforeEach(() => {
    workingDir = mkdtempSync(path.join(tmpdir(), 'sweetlink-config-'));
    process.chdir(workingDir);
    resetSweetLinkFileConfigCache();
  });

  afterEach(() => {
    process.chdir(ORIGINAL_CWD);
    resetSweetLinkFileConfigCache();
    if (workingDir) {
      rmSync(workingDir, { recursive: true, force: true });
      workingDir = null;
    }
    vi.restoreAllMocks();
  });

  it('returns an empty config when no file is present', () => {
    const loaded = loadSweetLinkFileConfig();
    expect(loaded.path).toBeNull();
    expect(loaded.config).toEqual({});
  });

  it('parses sweetlink.json values when present', () => {
    const filePath = path.join(process.cwd(), 'sweetlink.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        appUrl: 'http://localhost:4100',
        prodUrl: 'https://demo.sweetlink.test',
        daemonUrl: 'https://localhost:4456',
        adminKey: 'abc123',
        port: 4100,
        cookieMappings: [
          {
            hosts: ['example.dev', '*.demo.local'],
            origins: ['https://x.com', 'https://api.twitter.com'],
          },
        ],
        healthChecks: {
          paths: ['/api/health'],
        },
        smokeRoutes: {
          defaults: ['timeline', 'settings/account'],
          presets: {
            custom: ['foo', 'bar'],
          },
        },
        servers: [
          {
            env: 'dev',
            start: ['pnpm', 'run', 'dev'],
            check: ['curl', '--fail', 'http://localhost:4100/api/health'],
            timeoutMs: 45_000,
            cwd: './apps/web',
          },
        ],
      }),
      'utf8'
    );

    const loaded = loadSweetLinkFileConfig();
    expect(loaded.path).toEqual(filePath);
    expect(loaded.config).toEqual({
      appUrl: 'http://localhost:4100',
      prodUrl: 'https://demo.sweetlink.test',
      daemonUrl: 'https://localhost:4456',
      adminKey: 'abc123',
      port: 4100,
      cookieMappings: [
        {
          hosts: ['example.dev', '*.demo.local'],
          origins: ['https://x.com', 'https://api.twitter.com'],
        },
      ],
      healthChecks: {
        paths: ['/api/health'],
      },
      smokeRoutes: {
        defaults: ['timeline', 'settings/account'],
        presets: {
          custom: ['foo', 'bar'],
        },
      },
      servers: [
        {
          env: 'dev',
          start: ['pnpm', 'run', 'dev'],
          check: ['curl', '--fail', 'http://localhost:4100/api/health'],
          timeoutMs: 45_000,
          cwd: path.join(process.cwd(), 'apps', 'web'),
        },
      ],
    });
  });

  it('normalizes dev server commands when provided as strings', () => {
    const filePath = path.join(process.cwd(), 'sweetlink.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        servers: [
          {
            env: 'dev',
            start: 'pnpm run dev',
            check: 'curl --fail http://localhost:3000/api/health',
          },
        ],
      }),
      'utf8'
    );

    const loaded = loadSweetLinkFileConfig();
    expect(loaded.config.servers).toEqual([
      {
        env: 'dev',
        start: ['sh', '-c', 'pnpm run dev'],
        check: ['sh', '-c', 'curl --fail http://localhost:3000/api/health'],
        cwd: process.cwd(),
      },
    ]);
  });

  it('returns empty config and warns when JSON is invalid', () => {
    const filePath = path.join(process.cwd(), 'sweetlink.json');
    writeFileSync(filePath, '{ invalid json', 'utf8');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);

    const loaded = loadSweetLinkFileConfig();
    expect(loaded.path).toEqual(filePath);
    expect(loaded.config).toEqual({});
    expect(warnSpy).toHaveBeenCalled();
  });
});
