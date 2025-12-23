import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { logDebugError } from '../../util/errors.js';
import { delay } from '../../util/time.js';
import { connectPuppeteerBrowser, navigatePuppeteerPage, resolvePuppeteerPage, waitForPageReady, } from '../chrome/puppeteer.js';
import { urlsRoughlyMatch } from '../url.js';
import { evaluateInDevToolsTab, fetchDevToolsTabsWithRetry } from './cdp.js';
let cachedAutomation = null;
const warnedMissingScriptPaths = new Set();
export async function attemptTwitterOauthAutoAccept({ devtoolsUrl, sessionUrl, scriptPath, }) {
    const automation = await loadOauthAutomation(scriptPath);
    if (!automation) {
        if (!warnedMissingScriptPaths.has(scriptPath ?? null)) {
            const message = scriptPath
                ? `[sweetlink] OAuth automation script not found at "${scriptPath}". Auto-authorize is disabled.`
                : '[sweetlink] No OAuth automation script configured. Auto-authorize is disabled.';
            console.warn(message);
            warnedMissingScriptPaths.add(scriptPath ?? null);
        }
        return { handled: false, reason: scriptPath ? 'oauth-handler-not-found' : 'oauth-handler-not-configured' };
    }
    const context = {
        devtoolsUrl,
        sessionUrl,
        fetchTabs: (overrideUrl) => fetchDevToolsTabsWithRetry(overrideUrl ?? devtoolsUrl),
        evaluateInDevToolsTab: async (targetUrl, expression) => evaluateInDevToolsTab(devtoolsUrl, targetUrl, expression),
        urlsRoughlyMatch,
        connectPuppeteer: async (attempts = 3) => {
            try {
                const puppeteerModule = await import('puppeteer');
                return await connectPuppeteerBrowser(puppeteerModule.default, devtoolsUrl, attempts);
            }
            catch (error) {
                logDebugError('Unable to load Puppeteer for OAuth automation', error);
                return null;
            }
        },
        resolvePuppeteerPage,
        navigatePuppeteerPage,
        waitForPageReady,
        delay,
        logDebugError,
    };
    try {
        const rawResult = await automation.authorize(context);
        return normalizeAutomationResult(rawResult);
    }
    catch (error) {
        logDebugError('OAuth automation script threw an error', error);
        return { handled: false, reason: 'oauth-handler-error' };
    }
}
async function loadOauthAutomation(scriptPath) {
    if (!scriptPath) {
        return null;
    }
    const resolvedPath = path.isAbsolute(scriptPath) ? scriptPath : path.resolve(process.cwd(), scriptPath);
    if (cachedAutomation && cachedAutomation.path === resolvedPath) {
        return cachedAutomation.automation;
    }
    try {
        const moduleUrl = pathToFileURL(resolvedPath).href;
        const imported = await import(moduleUrl);
        const automation = normalizeAutomationModule(imported);
        if (!automation) {
            console.warn(`[sweetlink] OAuth automation script "${resolvedPath}" does not export an authorize(context) function.`);
            return null;
        }
        cachedAutomation = { path: resolvedPath, automation };
        return automation;
    }
    catch (error) {
        console.warn(`[sweetlink] Failed to load OAuth automation script "${resolvedPath}":`, error instanceof Error ? error.message : error);
        return null;
    }
}
function normalizeAutomationModule(candidate) {
    if (!candidate) {
        return null;
    }
    if (isAutomation(candidate)) {
        return candidate;
    }
    if (typeof candidate === 'object') {
        const record = candidate;
        if (isAutomation(record.default)) {
            return record.default;
        }
        if (isAutomation(record.automation)) {
            return record.automation;
        }
        if (typeof record.authorize === 'function') {
            return { authorize: record.authorize };
        }
    }
    if (typeof candidate === 'function') {
        const fn = candidate;
        return {
            authorize: (context) => Promise.resolve(fn(context)),
        };
    }
    return null;
}
function isAutomation(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const record = value;
    return typeof record.authorize === 'function';
}
function normalizeAutomationResult(value) {
    if (value && typeof value === 'object') {
        const record = value;
        if (typeof record.handled === 'boolean') {
            return {
                handled: record.handled,
                action: typeof record.action === 'string' ? record.action : undefined,
                reason: typeof record.reason === 'string' ? record.reason : undefined,
                clickedText: typeof record.clickedText === 'string' || record.clickedText === null ? record.clickedText : undefined,
                hasUsernameInput: record.hasUsernameInput === true,
                hasPasswordInput: record.hasPasswordInput === true,
                url: typeof record.url === 'string' ? record.url : undefined,
                host: typeof record.host === 'string' ? record.host : undefined,
                title: typeof record.title === 'string' ? record.title : undefined,
            };
        }
    }
    return { handled: false, reason: 'oauth-handler-invalid-result' };
}
//# sourceMappingURL=oauth.js.map