import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildWaitCandidateUrls,
  configurePathRedirects,
  normalizeUrlForMatch,
  trimTrailingSlash,
  urlsRoughlyMatch,
} from '../src/runtime/url';

describe('runtime/url utilities', () => {
  beforeEach(() => {
    configurePathRedirects(undefined);
  });

  it('normalizes URLs and tolerates invalid input', () => {
    expect(normalizeUrlForMatch('https://app.example.dev/path')?.hostname).toBe('app.example.dev');
    expect(normalizeUrlForMatch('not-a-url')).toBeNull();
    expect(normalizeUrlForMatch()).toBeNull();
  });

  it('trims trailing slashes but preserves root path', () => {
    expect(trimTrailingSlash('/timeline/index/')).toBe('/timeline/index');
    expect(trimTrailingSlash('///')).toBe('/');
    expect(trimTrailingSlash('')).toBe('/');
  });

  it('compares URLs loosely, allowing marketing suffixes', () => {
    expect(urlsRoughlyMatch('https://localhost:3000/timeline/index', 'https://localhost:3000/timeline/')).toBe(true);
    expect(urlsRoughlyMatch('https://localhost:3000/timeline/overview', 'https://localhost:3000/timeline/')).toBe(
      true
    );
    expect(urlsRoughlyMatch('https://localhost:3000/settings/account', 'https://localhost:3000/insights')).toBe(false);
    expect(urlsRoughlyMatch('invalid-url', 'invalid-url')).toBe(true);
    expect(urlsRoughlyMatch('invalid-url', 'another')).toBe(false);
  });

  it('builds wait candidates including timeline and auth fallbacks', () => {
    const candidates = buildWaitCandidateUrls('http://localhost:3000/?sweetlink=auto');
    expect(candidates).toEqual(
      expect.arrayContaining([
        'http://localhost:3000/',
        'http://localhost:3000/?sweetlink=auto',
        'http://localhost:3000/timeline',
        'http://localhost:3000/timeline/index',
        'http://localhost:3000/timeline/overview',
        'http://localhost:3000/auth/signin',
      ])
    );

    const authCandidates = buildWaitCandidateUrls('https://app.example.dev/auth');
    expect(authCandidates).toContain('https://app.example.dev/auth/signin');

    const aliasCandidates = buildWaitCandidateUrls('https://app.example.dev/insights?tab=main', [
      'https://app.example.dev/insights',
      'https://app.example.dev/insights/overview',
    ]);
    expect(aliasCandidates).toEqual(
      expect.arrayContaining(['https://app.example.dev/insights', 'https://app.example.dev/insights/overview'])
    );
  });

  it('honors configured redirects when comparing URLs', () => {
    configurePathRedirects({ '/': '/timeline', '/workspace': '/workspace/overview' });
    expect(urlsRoughlyMatch('https://localhost:3000/', 'https://localhost:3000/timeline')).toBe(true);
    expect(urlsRoughlyMatch('https://localhost:3000/workspace', 'https://localhost:3000/workspace/overview')).toBe(
      true
    );
    const candidates = buildWaitCandidateUrls('https://localhost:3000/');
    expect(candidates).toContain('https://localhost:3000/timeline');
  });
});
