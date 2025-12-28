import { URL } from 'node:url';
import { LEADING_SLASH_PATTERN, TRAILING_SLASH_PATTERN } from '../util/regex.js';

export const LOOSE_PATH_SUFFIXES = ['index', 'overview'] as const;

let pathRedirects: Record<string, string> = {};

export function configurePathRedirects(map: Record<string, string> | undefined): void {
  pathRedirects = {};
  if (!map) {
    return;
  }
  for (const [rawSource, rawTarget] of Object.entries(map)) {
    const source = trimTrailingSlash(rawSource);
    const target = trimTrailingSlash(rawTarget);
    pathRedirects[source] = target;
  }
}

export function normalizeUrlForMatch(input?: string | null): URL | null {
  if (!input) {
    return null;
  }
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

export function trimTrailingSlash(path: string): string {
  if (!path) {
    return '/';
  }
  const trimmed = path.replace(TRAILING_SLASH_PATTERN, '');
  if (!trimmed) {
    return '/';
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function extractPathSegments(path: string): string[] {
  const normalized = trimTrailingSlash(path);
  if (normalized === '/' || normalized.length === 0) {
    return [];
  }
  return normalized.replace(LEADING_SLASH_PATTERN, '').split('/');
}

export function suffixSegmentsAllowed(segments: string[]): boolean {
  if (segments.length === 0) {
    return true;
  }
  return segments.every((segment) => LOOSE_PATH_SUFFIXES.includes(segment as (typeof LOOSE_PATH_SUFFIXES)[number]));
}

export function urlsRoughlyMatch(a: string, b: string): boolean {
  const urlA = normalizeUrlForMatch(a);
  const urlB = normalizeUrlForMatch(b);
  if (!(urlA && urlB)) {
    return a === b;
  }
  if (urlA.origin !== urlB.origin) {
    return false;
  }
  const pathA = normalizePathWithRedirect(urlA.pathname);
  const pathB = normalizePathWithRedirect(urlB.pathname);
  if (pathA === pathB) {
    return true;
  }
  const segmentsA = extractPathSegments(pathA);
  const segmentsB = extractPathSegments(pathB);
  const minLength = Math.min(segmentsA.length, segmentsB.length);
  for (let index = 0; index < minLength; index += 1) {
    if (segmentsA[index] !== segmentsB[index]) {
      return false;
    }
  }
  const remainderA = segmentsA.slice(minLength);
  const remainderB = segmentsB.slice(minLength);
  return suffixSegmentsAllowed(remainderA) && suffixSegmentsAllowed(remainderB);
}

export function buildWaitCandidateUrls(targetUrl: string, aliases?: readonly string[]): string[] {
  const candidates = new Set<string>([targetUrl]);

  const normalized = normalizeUrlForMatch(targetUrl);
  if (normalized) {
    const withoutQuery = new URL(normalized.toString());
    withoutQuery.search = '';
    candidates.add(withoutQuery.toString());

    const trimmedPath = trimTrailingSlash(withoutQuery.pathname);
    if (trimmedPath && trimmedPath !== '/') {
      for (const suffix of LOOSE_PATH_SUFFIXES) {
        if (trimmedPath.endsWith(`/${suffix}`)) {
          continue;
        }
        const alternative = new URL(withoutQuery.toString());
        alternative.pathname = `${trimmedPath}/${suffix}`;
        candidates.add(alternative.toString());
      }

      if (trimmedPath === '/auth') {
        const signinVariant = new URL(withoutQuery.toString());
        signinVariant.pathname = '/auth/signin';
        candidates.add(signinVariant.toString());
      } else if (trimmedPath === '/login') {
        const signinVariant = new URL(withoutQuery.toString());
        signinVariant.pathname = '/auth/signin';
        candidates.add(signinVariant.toString());
      }
      const redirectedPath = pathRedirects[trimmedPath];
      if (redirectedPath && redirectedPath !== trimmedPath) {
        const redirectUrl = new URL(withoutQuery.toString());
        redirectUrl.pathname = redirectedPath;
        candidates.add(redirectUrl.toString());
      }
    } else if (trimmedPath === '/') {
      // Marketing shell redirects "/" launches to the timeline; seed common timeline paths so
      // the CLI keeps waiting for the redirected session instead of timing out.
      const timelineBase = new URL(withoutQuery.toString());
      timelineBase.pathname = '/timeline';
      candidates.add(timelineBase.toString());
      for (const suffix of LOOSE_PATH_SUFFIXES) {
        const alternative = new URL(timelineBase.toString());
        alternative.pathname = `/timeline/${suffix}`;
        candidates.add(alternative.toString());
      }

      const authSignin = new URL(withoutQuery.toString());
      authSignin.pathname = '/auth/signin';
      candidates.add(authSignin.toString());

      const redirectedPath = pathRedirects['/'];
      if (redirectedPath && redirectedPath !== '/') {
        const redirectUrl = new URL(withoutQuery.toString());
        redirectUrl.pathname = redirectedPath;
        candidates.add(redirectUrl.toString());
      }
    }
  }

  if (aliases) {
    for (const alias of aliases) {
      if (!alias) {
        continue;
      }
      candidates.add(alias);
    }
  }

  return [...candidates];
}

function normalizePathWithRedirect(pathname: string): string {
  const trimmed = trimTrailingSlash(pathname);
  const redirected = pathRedirects[trimmed];
  return redirected ?? trimmed;
}
