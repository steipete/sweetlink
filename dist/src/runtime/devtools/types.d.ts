import type { Browser, Page } from 'playwright-core';
import type { Browser as PuppeteerBrowser, Page as PuppeteerPage } from 'puppeteer';
export interface SweetLinkBootstrapDiagnostics {
    readyState?: string;
    autoFlag?: boolean;
    bootstrapEmits?: number;
    sessionStorageAuto?: string | null;
    locationHref?: string | null;
    locationPathname?: string | null;
    errors?: Array<{
        type?: string;
        message?: string;
        source?: string | null;
        stack?: string | null;
        status?: number | null;
        timestamp?: number | null;
    }>;
    overlayText?: string | null;
    nextRouteError?: {
        message?: string | null;
        digest?: string | null;
    } | null;
}
export type BootstrapDiagnosticError = NonNullable<SweetLinkBootstrapDiagnostics['errors']>[number];
export interface DevToolsConfig {
    readonly devtoolsUrl: string;
    readonly port: number;
    readonly userDataDir: string;
    readonly updatedAt: number;
    readonly targetUrl?: string;
    readonly sessionId?: string;
    readonly oauthScriptPath?: string | null;
    readonly viewport?: {
        readonly width: number;
        readonly height: number;
        readonly deviceScaleFactor?: number;
    };
}
export interface DevToolsState {
    endpoint: string;
    sessionId?: string;
    viewport?: {
        readonly width: number;
        readonly height: number;
        readonly deviceScaleFactor?: number;
    };
    console: DevToolsConsoleEntry[];
    network: DevToolsNetworkEntry[];
    updatedAt: number;
}
export interface DevToolsConsoleEntry {
    readonly ts: number;
    readonly type: string;
    readonly text: string;
    readonly args: unknown[];
    readonly location?: {
        readonly url?: string;
        readonly lineNumber?: number;
        readonly columnNumber?: number;
    };
}
export interface DevToolsNetworkEntry {
    readonly ts: number;
    readonly method: string;
    readonly url: string;
    readonly status?: number;
    readonly resourceType?: string;
    readonly failureText?: string;
}
export interface DevToolsTabEntry {
    id: string;
    title: string;
    url: string;
    type?: string;
    webSocketDebuggerUrl?: string;
}
export type ResolvedDevToolsConnection = {
    browser: Browser;
    page: Page;
};
export type TwitterOauthAutoAcceptResult = {
    handled: boolean;
    action?: string;
    reason?: string;
    clickedText?: string | null;
    hasUsernameInput?: boolean;
    hasPasswordInput?: boolean;
    url?: string;
    title?: string;
    host?: string;
};
export interface SweetLinkOauthAuthorizeContext {
    readonly devtoolsUrl: string;
    readonly sessionUrl: string;
    readonly fetchTabs: (overrideUrl?: string) => Promise<DevToolsTabEntry[]>;
    readonly evaluateInDevToolsTab: (targetUrl: string, expression: string) => Promise<unknown>;
    readonly urlsRoughlyMatch: (candidate: string, target: string) => boolean;
    readonly connectPuppeteer: (attempts?: number) => Promise<PuppeteerBrowser | null>;
    readonly resolvePuppeteerPage: (browser: PuppeteerBrowser, targetUrl: string) => Promise<PuppeteerPage | null>;
    readonly navigatePuppeteerPage: (page: PuppeteerPage, targetUrl: string, attempts?: number) => Promise<boolean>;
    readonly waitForPageReady: (page: PuppeteerPage) => Promise<void>;
    readonly delay: (milliseconds: number) => Promise<void>;
    readonly logDebugError: (message: string, error?: unknown) => void;
}
export interface SweetLinkOauthAutomation {
    authorize(context: SweetLinkOauthAuthorizeContext): Promise<TwitterOauthAutoAcceptResult> | TwitterOauthAutoAcceptResult;
}
//# sourceMappingURL=types.d.ts.map