import { logDebugError } from '../../util/errors.js';
import { delay } from '../../util/time.js';
import { attemptTwitterOauthAutoAccept } from '../devtools/oauth.js';
import { urlsRoughlyMatch } from '../url.js';
import { PUPPETEER_NAVIGATION_TIMEOUT_MS } from './constants.js';
import { connectPuppeteerBrowser, navigatePuppeteerPage, resolvePuppeteerPage, waitForPageReady } from './puppeteer.js';
const OAUTH_HOSTS = new Set(['x.com', 'twitter.com', 'api.twitter.com']);
const OAUTH_PATH_PATTERN = /oauth|authorize/i;
const SIGN_IN_PATHS = ['/auth/signin', '/sign-in', '/login', '/auth/login', '/api/auth/signin'];
const SIGN_IN_TEXT_TARGETS = [
    'continue with twitter',
    'sign in with twitter',
    'continue with x',
    'sign in with x',
];
const OAUTH_KICKOFF_PATH = '/api/auth/sign-in/social';
export async function ensureDeepLinkAuthFlow(params) {
    const targetUrl = normalizeUrl(params.targetUrl);
    if (!targetUrl) {
        return { signInClicked: false, navigatedToTarget: false, finalUrl: null };
    }
    let puppeteerModule = null;
    try {
        puppeteerModule = await import('puppeteer');
    }
    catch (error) {
        logDebugError('Unable to load Puppeteer for deep-link auth flow', error);
        return { signInClicked: false, navigatedToTarget: false, finalUrl: null };
    }
    const browser = await connectPuppeteerBrowser(puppeteerModule.default, params.devtoolsUrl, 2);
    if (!browser) {
        return { signInClicked: false, navigatedToTarget: false, finalUrl: null };
    }
    let oauthAttempt;
    let signInClicked = false;
    try {
        const targetOrigin = targetUrl.origin;
        const signInUrl = new URL('/auth/signin', targetOrigin).toString();
        const existingTarget = await findMatchingPageUrl(browser, targetUrl.toString());
        if (existingTarget) {
            return { signInClicked: false, navigatedToTarget: true, finalUrl: existingTarget };
        }
        let page = await resolvePuppeteerPage(browser, targetUrl.toString());
        if (!page) {
            const pages = await browser.pages();
            page = pages.find((candidate) => isSameOrigin(candidate?.url?.() ?? '', targetOrigin)) ?? pages[0] ?? null;
        }
        if (!page) {
            return { signInClicked: false, navigatedToTarget: false, finalUrl: null };
        }
        await waitForPageReady(page);
        await navigatePuppeteerPage(page, targetUrl.toString(), 2);
        await delay(500);
        let currentUrl = normalizeUrl(page.url());
        if (currentUrl && urlsRoughlyMatch(currentUrl.toString(), targetUrl.toString())) {
            return { signInClicked: false, navigatedToTarget: true, finalUrl: currentUrl.toString() };
        }
        if (!currentUrl || !isSameOrigin(currentUrl.toString(), targetOrigin)) {
            await navigatePuppeteerPage(page, targetOrigin, 2);
            await delay(500);
            currentUrl = normalizeUrl(page.url());
        }
        if (currentUrl && isSameOrigin(currentUrl.toString(), targetOrigin)) {
            signInClicked = await attemptOauthKickoff(page, targetUrl.toString());
            if (signInClicked) {
                await delay(800);
                currentUrl = normalizeUrl(page.url());
            }
        }
        if (!signInClicked) {
            if (currentUrl && isSameOrigin(currentUrl.toString(), targetOrigin) && !isLikelySignInUrl(currentUrl)) {
                await navigatePuppeteerPage(page, signInUrl, 2);
                await delay(500);
                currentUrl = normalizeUrl(page.url());
            }
            if (currentUrl && isLikelySignInUrl(currentUrl)) {
                signInClicked = await attemptAppSignIn(page);
                if (signInClicked) {
                    await delay(800);
                    currentUrl = normalizeUrl(page.url());
                }
            }
        }
        const hasOauthPage = currentUrl && isLikelyOauthUrl(currentUrl) ? true : await hasOauthTab(browser);
        if (signInClicked || hasOauthPage) {
            oauthAttempt = await attemptTwitterOauthAutoAccept({
                devtoolsUrl: params.devtoolsUrl,
                sessionUrl: targetUrl.toString(),
                scriptPath: params.oauthScriptPath,
            });
        }
        await delay(400);
        await navigatePuppeteerPage(page, targetUrl.toString(), 2);
        await delay(500);
        currentUrl = normalizeUrl(page.url());
        return {
            signInClicked,
            oauthAttempt,
            navigatedToTarget: Boolean(currentUrl && urlsRoughlyMatch(currentUrl.toString(), targetUrl.toString())),
            finalUrl: currentUrl?.toString() ?? null,
        };
    }
    catch (error) {
        logDebugError('Deep-link auth flow failed', error);
        return { signInClicked: false, navigatedToTarget: false, finalUrl: null, oauthAttempt };
    }
    finally {
        try {
            await browser.disconnect();
        }
        catch {
            /* ignore */
        }
    }
}
async function attemptAppSignIn(page) {
    const handle = await page.evaluateHandle((targets) => {
        const candidates = document.querySelectorAll('button, a, div[role=\"button\"]');
        for (const candidate of candidates) {
            const text = candidate.textContent?.trim().toLowerCase() ?? '';
            if (!text) {
                continue;
            }
            if (targets.some((target) => text.includes(target))) {
                return candidate;
            }
        }
        return null;
    }, SIGN_IN_TEXT_TARGETS);
    const element = handle.asElement();
    if (!element) {
        await handle.dispose();
        return false;
    }
    try {
        await element.click({ delay: 25 });
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: PUPPETEER_NAVIGATION_TIMEOUT_MS });
    }
    catch (error) {
        logDebugError('Sign-in click failed or navigation timed out', error);
    }
    finally {
        await element.dispose?.();
    }
    return true;
}
async function attemptOauthKickoff(page, callbackUrl) {
    const result = await page
        .evaluate(async ({ path, target }) => {
        try {
            const response = await fetch(path, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ provider: 'twitter', callbackURL: target }),
            });
            if (!response.ok) {
                return { started: false, reason: `request failed (${response.status})` };
            }
            const payload = await response.json();
            if (payload && typeof payload === 'object') {
                const record = payload;
                if (record.redirect === true && typeof record.url === 'string' && record.url.length > 0) {
                    window.location.assign(record.url);
                    return { started: true };
                }
            }
            return { started: false, reason: 'no redirect returned' };
        }
        catch (error) {
            return { started: false, reason: String(error ?? 'request failed') };
        }
    }, { path: OAUTH_KICKOFF_PATH, target: callbackUrl })
        .catch((error) => {
        logDebugError('OAuth kickoff failed', error);
        return { started: false, reason: 'exception' };
    });
    return Boolean(result?.started);
}
function normalizeUrl(raw) {
    if (!raw) {
        return null;
    }
    try {
        return new URL(raw);
    }
    catch {
        return null;
    }
}
function isSameOrigin(url, origin) {
    try {
        return new URL(url).origin === origin;
    }
    catch {
        return false;
    }
}
function isLikelySignInUrl(url) {
    if (!url.pathname) {
        return false;
    }
    return SIGN_IN_PATHS.some((path) => url.pathname.startsWith(path));
}
function isLikelyOauthUrl(url) {
    if (OAUTH_HOSTS.has(url.hostname)) {
        return true;
    }
    return OAUTH_PATH_PATTERN.test(url.pathname);
}
async function findMatchingPageUrl(browser, targetUrl) {
    const pages = await browser.pages();
    for (const page of pages) {
        const candidateUrl = page?.url?.();
        if (candidateUrl && urlsRoughlyMatch(candidateUrl, targetUrl)) {
            return candidateUrl;
        }
    }
    return null;
}
async function hasOauthTab(browser) {
    const pages = await browser.pages();
    for (const page of pages) {
        const candidateUrl = normalizeUrl(page?.url?.());
        if (candidateUrl && isLikelyOauthUrl(candidateUrl)) {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=deep-link.js.map