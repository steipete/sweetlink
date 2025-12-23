#!/usr/bin/env node
import { prepareChromeLaunch } from './runtime/chrome.js';
import { buildCookieOrigins, collectChromeCookies, normalizePuppeteerCookie } from './runtime/cookies.js';
import { deriveDevtoolsLinkInfo } from './runtime/devtools.js';
import { buildClickScript } from './runtime/session.js';
import { buildWaitCandidateUrls } from './runtime/url.js';
export declare function formatPathForDisplay(value: string): string;
export declare const __sweetlinkCliTestHelpers: {
    collectChromeCookies: typeof collectChromeCookies;
    normalizePuppeteerCookie: typeof normalizePuppeteerCookie;
    buildCookieOrigins: typeof buildCookieOrigins;
    prepareChromeLaunch: typeof prepareChromeLaunch;
    buildWaitCandidateUrls: typeof buildWaitCandidateUrls;
    deriveDevtoolsLinkInfo: typeof deriveDevtoolsLinkInfo;
    buildClickScript: typeof buildClickScript;
};
export { diagnosticsContainBlockingIssues, logBootstrapDiagnostics } from './runtime/devtools.js';
export { buildClickScript, fetchConsoleEvents, fetchSessionSummaries, formatSessionHeadline, resolvePromptOption, resolveSessionIdFromHint, } from './runtime/session.js';
//# sourceMappingURL=index.d.ts.map