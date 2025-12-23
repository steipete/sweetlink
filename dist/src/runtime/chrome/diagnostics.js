import { sweetLinkDebug } from '../../env.js';
import { connectPuppeteerBrowser, resolvePuppeteerPage, waitForPageReady } from './puppeteer.js';
export async function collectPuppeteerDiagnostics(devtoolsUrl, targetUrl) {
    let puppeteer;
    try {
        ({ default: puppeteer } = await import('puppeteer'));
    }
    catch (error) {
        console.warn('Unable to load Puppeteer while collecting diagnostics:', error);
        return null;
    }
    const browser = await connectPuppeteerBrowser(puppeteer, devtoolsUrl, 2);
    if (!browser) {
        return null;
    }
    try {
        const page = await resolvePuppeteerPage(browser, targetUrl);
        if (!page) {
            return null;
        }
        await waitForPageReady(page).catch(() => {
            /* ignore readiness errors */
        });
        return await page.evaluate(() => {
            const overlay = document.querySelector('[data-nextjs-error-overlay-root]') ||
                document.querySelector('[data-nextjs-error-overlay]') ||
                document.querySelector('#__nextjs__container_errors');
            const overlayText = overlay && typeof overlay.textContent === 'string' ? overlay.textContent : null;
            const bodyText = document.body && typeof document.body.textContent === 'string' ? document.body.textContent : null;
            const title = typeof document.title === 'string' ? document.title : null;
            return { overlayText, bodyText, title };
        });
    }
    catch (error) {
        if (sweetLinkDebug) {
            console.warn('Unable to capture Puppeteer diagnostics:', error);
        }
        return null;
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
//# sourceMappingURL=diagnostics.js.map