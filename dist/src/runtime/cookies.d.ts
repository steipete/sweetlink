export interface ChromeCookiesSecureModule {
    getCookiesPromised(url: string, format: 'object', profilePath?: string): Promise<Record<string, ChromeCookieEntry>>;
    getCookiesPromised(url: string, format: 'puppeteer', profilePath?: string): Promise<Record<string, unknown>[]>;
}
interface ChromeCookieEntry {
    name?: string;
    value?: string;
    domain?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: string;
    expirationDate?: number;
}
export interface PuppeteerCookieParam {
    name: string;
    value: string;
    url?: string;
    domain?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    expires?: number;
}
/** Collects cookies from the main Chrome profile matching the provided URL. */
export declare function collectChromeCookies(targetUrl: string): Promise<PuppeteerCookieParam[]>;
/** Collects cookies for each domain and groups them by the originating host. */
export declare function collectChromeCookiesForDomains(domains: readonly (string | undefined)[]): Promise<Record<string, PuppeteerCookieParam[]>>;
/** Returns the full set of origins SweetLink cares about for authentication. */
export declare function buildCookieOrigins(targetUrl: string): string[];
export declare function normalizePuppeteerCookie(cookie: Record<string, unknown>, bases: {
    sourceBase: URL;
    targetBase: URL;
}): PuppeteerCookieParam | null;
export {};
//# sourceMappingURL=cookies.d.ts.map