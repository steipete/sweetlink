import { URL } from 'node:url';
export declare const LOOSE_PATH_SUFFIXES: readonly ["index", "overview"];
export declare function configurePathRedirects(map: Record<string, string> | undefined): void;
export declare function normalizeUrlForMatch(input?: string | null): URL | null;
export declare function trimTrailingSlash(path: string): string;
export declare function extractPathSegments(path: string): string[];
export declare function suffixSegmentsAllowed(segments: string[]): boolean;
export declare function urlsRoughlyMatch(a: string, b: string): boolean;
export declare function buildWaitCandidateUrls(targetUrl: string, aliases?: readonly string[]): string[];
//# sourceMappingURL=url.d.ts.map