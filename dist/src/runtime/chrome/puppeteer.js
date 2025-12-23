import { logDebugError } from '../../util/errors.js';
import { delay } from '../../util/time.js';
import { urlsRoughlyMatch } from '../url.js';
import { PAGE_READY_PRIMARY_TIMEOUT_MS, PAGE_READY_SECONDARY_TIMEOUT_MS, PUPPETEER_NAVIGATION_TIMEOUT_MS, PUPPETEER_PROTOCOL_TIMEOUT_MS, } from './constants.js';
export async function connectPuppeteerBrowser(puppeteer, browserURL, attempts) {
    let lastError;
    const totalAttempts = Math.max(1, attempts);
    for (let index = 0; index < totalAttempts; index += 1) {
        try {
            // biome-ignore lint/performance/noAwaitInLoops: retries must connect sequentially.
            return await puppeteer.connect({
                browserURL,
                defaultViewport: null,
                protocolTimeout: PUPPETEER_PROTOCOL_TIMEOUT_MS,
            });
        }
        catch (error) {
            lastError = error;
            if (index < totalAttempts - 1) {
                await delay(200 * (index + 1));
            }
        }
    }
    console.warn('Unable to connect to DevTools endpoint at', browserURL, lastError ?? 'unknown error');
    return null;
}
export async function resolvePuppeteerPage(browser, targetUrl) {
    const attempts = 10;
    for (let attemptIndex = 0; attemptIndex < attempts; attemptIndex += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: polling tabs sequentially avoids racing stale page handles.
        const pages = await browser.pages();
        const match = pages.find((page) => {
            try {
                const url = page.url();
                return url && urlsRoughlyMatch(url, targetUrl);
            }
            catch {
                return false;
            }
        });
        if (match) {
            return match;
        }
        await delay(200);
    }
    return null;
}
export async function navigatePuppeteerPage(page, targetUrl, attempts = 2) {
    for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
        try {
            // biome-ignore lint/performance/noAwaitInLoops: navigation retries must happen sequentially.
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: PUPPETEER_NAVIGATION_TIMEOUT_MS });
            return true;
        }
        catch (error) {
            logDebugError('Unable to navigate controlled Chrome tab to target', error);
            if (attempt < attempts - 1) {
                await delay(300 * (attempt + 1));
            }
        }
    }
    return false;
}
export async function waitForPageReady(page) {
    try {
        await page.waitForFunction(() => document.readyState === 'complete', { timeout: PAGE_READY_PRIMARY_TIMEOUT_MS });
    }
    catch {
        try {
            await page.waitForFunction(() => document.readyState === 'interactive', {
                timeout: PAGE_READY_SECONDARY_TIMEOUT_MS,
            });
        }
        catch {
            /* swallow */
        }
    }
}
export async function attemptPuppeteerReload(page) {
    try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: PUPPETEER_NAVIGATION_TIMEOUT_MS });
    }
    catch (error) {
        logDebugError('Reloading the controlled tab failed', error);
    }
}
//# sourceMappingURL=puppeteer.js.map