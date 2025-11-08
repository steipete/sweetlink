import { delay } from '../../util/time.js';
import { buildCookieOrigins, collectChromeCookies } from '../cookies.js';
import { attemptPuppeteerReload, navigatePuppeteerPage, resolvePuppeteerPage, waitForPageReady } from './puppeteer.js';
type PrimeChromeCookiesDeps = {
    collectChromeCookies: typeof collectChromeCookies;
    resolvePuppeteerPage: typeof resolvePuppeteerPage;
    navigatePuppeteerPage: typeof navigatePuppeteerPage;
    waitForPageReady: typeof waitForPageReady;
    attemptPuppeteerReload: typeof attemptPuppeteerReload;
    delay: typeof delay;
    buildCookieOrigins: typeof buildCookieOrigins;
};
export declare function primeControlledChromeCookies(options: {
    devtoolsUrl: string;
    targetUrl: string;
    reload: boolean;
    context: 'new-window' | 'existing-tab' | 'new-tab';
}, deps?: Partial<PrimeChromeCookiesDeps>): Promise<void>;
export {};
//# sourceMappingURL=cookies.d.ts.map