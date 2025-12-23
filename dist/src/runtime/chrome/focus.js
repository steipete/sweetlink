import { logDebugError } from '../../util/errors.js';
import { connectPuppeteerBrowser, resolvePuppeteerPage } from './puppeteer.js';
export async function focusControlledChromePage(devtoolsUrl, targetUrl) {
    let puppeteer;
    try {
        ({ default: puppeteer } = await import('puppeteer'));
    }
    catch (error) {
        logDebugError('Unable to load Puppeteer while attempting to focus controlled Chrome', error);
        return false;
    }
    const browser = await connectPuppeteerBrowser(puppeteer, devtoolsUrl, 3);
    if (!browser) {
        return false;
    }
    try {
        let page = await resolvePuppeteerPage(browser, targetUrl);
        if (!page) {
            const pages = await browser.pages();
            page = pages.at(0) ?? null;
        }
        if (!page) {
            return false;
        }
        await page.bringToFront();
        return true;
    }
    catch (error) {
        logDebugError('Failed to focus controlled Chrome page', error);
        return false;
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
//# sourceMappingURL=focus.js.map