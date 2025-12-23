import { type Browser, type ConsoleMessage, type Page } from 'playwright-core';
import type { DevToolsConfig, DevToolsConsoleEntry, DevToolsState } from './config.js';
import type { DevToolsTabEntry, SweetLinkBootstrapDiagnostics } from './types.js';
export declare function collectBootstrapDiagnostics(devtoolsUrl: string, candidates: readonly string[]): Promise<SweetLinkBootstrapDiagnostics | null>;
export declare function discoverDevToolsEndpoints(): Promise<string[]>;
export declare function fetchDevToolsTabs(devtoolsUrl: string): Promise<DevToolsTabEntry[]>;
export declare function fetchDevToolsTabsWithRetry(devtoolsUrl: string, attempts?: number): Promise<DevToolsTabEntry[]>;
export declare function evaluateInDevToolsTab(devtoolsUrl: string, targetUrl: string, expression: string): Promise<unknown>;
export declare function connectToDevTools(config: DevToolsConfig): Promise<{
    browser: Browser;
    page: Page;
}>;
export declare function resolveDevToolsPage(browser: Browser, config: DevToolsConfig): Page;
export declare function serializeConsoleMessage(message: ConsoleMessage): Promise<DevToolsConsoleEntry>;
export declare function createEmptyDevToolsState(endpoint: string): DevToolsState;
export declare function trimBuffer<T>(buffer: T[], limit: number): void;
//# sourceMappingURL=cdp.d.ts.map