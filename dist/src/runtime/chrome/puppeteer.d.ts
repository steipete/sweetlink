import type { Browser as PuppeteerBrowser, Page as PuppeteerPage } from 'puppeteer';
export declare function connectPuppeteerBrowser(puppeteer: typeof import('puppeteer').default, browserURL: string, attempts: number): Promise<PuppeteerBrowser | null>;
export declare function resolvePuppeteerPage(browser: PuppeteerBrowser, targetUrl: string): Promise<PuppeteerPage | null>;
export declare function navigatePuppeteerPage(page: PuppeteerPage, targetUrl: string, attempts?: number): Promise<boolean>;
export declare function waitForPageReady(page: PuppeteerPage): Promise<void>;
export declare function attemptPuppeteerReload(page: PuppeteerPage): Promise<void>;
//# sourceMappingURL=puppeteer.d.ts.map