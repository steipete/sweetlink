import { regex } from 'arkregex';
import net from 'node:net';
import { cliEnv } from '../../env.js';
import { logDebugError } from '../../util/errors.js';
import { loadDevToolsConfig, saveDevToolsConfig } from '../devtools.js';
import { discoverDevToolsEndpoints } from '../devtools/cdp.js';
import { urlsRoughlyMatch } from '../url.js';
import { primeControlledChromeCookies } from './cookies.js';
import { connectPuppeteerBrowser, navigatePuppeteerPage } from './puppeteer.js';
import { DEVTOOLS_PORT_SCAN_END, DEVTOOLS_PORT_SCAN_START, PUPPETEER_RELOAD_TIMEOUT_MS } from './reuse/constants.js';
const TRAILING_SLASH_PATTERN = regex.as('/$');
export async function reuseExistingControlledChrome(target, options) {
    const explicitDevtoolsUrl = cliEnv.devtoolsUrl?.trim();
    const existingConfig = await loadDevToolsConfig();
    const candidates = [];
    if (explicitDevtoolsUrl) {
        candidates.push({ url: explicitDevtoolsUrl, source: 'env' });
    }
    if (existingConfig?.devtoolsUrl) {
        candidates.push({ url: existingConfig.devtoolsUrl, source: 'config' });
    }
    const discovered = await discoverDevToolsEndpoints();
    for (const url of discovered) {
        candidates.push({ url, source: 'scan' });
    }
    if (candidates.length === 0) {
        return null;
    }
    const seen = new Set();
    let puppeteer = null;
    try {
        const puppeteerModule = await import('puppeteer');
        puppeteer = puppeteerModule.default;
    }
    catch (error) {
        console.warn('Unable to load Puppeteer while reusing DevTools chrome:', error);
        return null;
    }
    for (const candidate of candidates) {
        const normalized = candidate.url.replace(TRAILING_SLASH_PATTERN, '');
        if (seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        const port = extractPortFromUrl(normalized);
        if (options.preferredPort && port !== options.preferredPort) {
            continue;
        }
        // biome-ignore lint/performance/noAwaitInLoops: reuse attempts must connect sequentially to respect preferred ports.
        const browser = await connectPuppeteerBrowser(puppeteer, normalized, 3);
        if (!browser) {
            continue;
        }
        try {
            const pages = await browser.pages();
            const matchPage = pages.find((page) => urlsRoughlyMatch(page.url(), target));
            let targetPageInfo = null;
            if (matchPage) {
                try {
                    await matchPage.reload({ waitUntil: 'domcontentloaded', timeout: PUPPETEER_RELOAD_TIMEOUT_MS });
                    targetPageInfo = { page: matchPage, context: 'existing-tab' };
                }
                catch (error) {
                    logDebugError('Failed to reload existing controlled Chrome tab', error);
                    const navigated = await navigatePuppeteerPage(matchPage, target, 3);
                    if (navigated) {
                        targetPageInfo = { page: matchPage, context: 'existing-tab' };
                    }
                }
            }
            if (!targetPageInfo) {
                const newPage = await browser.newPage();
                const navigated = await navigatePuppeteerPage(newPage, target, 3);
                if (!navigated) {
                    await newPage.close().catch(() => {
                        /* ignore */
                    });
                    continue;
                }
                targetPageInfo = { page: newPage, context: 'new-tab' };
            }
            if (!targetPageInfo) {
                continue;
            }
            if (options.bringToFront) {
                try {
                    await targetPageInfo.page.bringToFront();
                }
                catch (error) {
                    logDebugError('Failed to focus reused controlled Chrome tab', error);
                }
            }
            const { context: cookieContext } = targetPageInfo;
            const userDataDirectoryHint = candidate.source === 'config' ? (existingConfig?.userDataDir ?? null) : null;
            const userDataDirectory = await persistDevToolsReuse(normalized, port, target, userDataDirectoryHint);
            if (options.cookieSync) {
                const shouldReload = cookieContext !== 'existing-tab';
                await primeControlledChromeCookies({
                    devtoolsUrl: normalized,
                    targetUrl: target,
                    reload: shouldReload,
                    context: cookieContext,
                });
            }
            return {
                devtoolsUrl: normalized,
                targetAlreadyOpen: cookieContext === 'existing-tab',
                userDataDir: userDataDirectory ?? undefined,
            };
        }
        catch (error) {
            console.warn('Failed to reuse DevTools instance at', normalized, error);
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
    return null;
}
export async function findAvailablePort(start = DEVTOOLS_PORT_SCAN_START, end = DEVTOOLS_PORT_SCAN_END) {
    for (let port = start; port <= end; port += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: scanning ports sequentially prevents saturating the system.
        const available = await isPortAvailable(port);
        if (available) {
            return port;
        }
    }
    throw new Error('No available DevTools port found between 9222 and 9322');
}
async function isPortAvailable(port) {
    return await new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => {
            resolve(false);
        });
        server.once('listening', () => {
            server.close(() => resolve(true));
        });
        server.listen(port, '127.0.0.1');
    });
}
export async function persistDevToolsReuse(devtoolsUrl, port, target, userDataDirectoryHint) {
    const derivedPort = port ?? extractPortFromUrl(devtoolsUrl);
    if (derivedPort === null) {
        return userDataDirectoryHint ?? null;
    }
    const userDataDirectory = userDataDirectoryHint ?? '[external-profile]';
    await saveDevToolsConfig({
        devtoolsUrl,
        port: derivedPort,
        userDataDir: userDataDirectory,
        updatedAt: Date.now(),
        targetUrl: target,
    }).catch((error) => {
        console.warn('Failed to persist DevTools config for reused session:', error);
    });
    return userDataDirectory;
}
export function extractPortFromUrl(devtoolsUrl) {
    try {
        const parsed = new URL(devtoolsUrl);
        if (parsed.port) {
            const value = Number(parsed.port);
            return Number.isFinite(value) ? value : null;
        }
        if (parsed.protocol === 'http:') {
            return 80;
        }
        if (parsed.protocol === 'https:') {
            return 443;
        }
        return null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=reuse.js.map