import type { Request } from 'playwright-core';
import type { SweetLinkBootstrapDiagnostics } from './types.js';
import type { DevToolsConsoleEntry, DevToolsNetworkEntry } from './config.js';
type RequestLike = Pick<Request, 'method' | 'url' | 'resourceType'>;
export declare function logBootstrapDiagnostics(label: string, diagnostics: SweetLinkBootstrapDiagnostics): void;
export declare function logDevtoolsConsoleSummary(label: string, entries: readonly DevToolsConsoleEntry[], limit?: number): void;
export declare function diagnosticsContainBlockingIssues(diagnostics: SweetLinkBootstrapDiagnostics): boolean;
export declare function formatConsoleArg(value: unknown): string;
export declare function createNetworkEntryFromRequest(request: RequestLike, status?: number, failureText?: string): DevToolsNetworkEntry;
export {};
//# sourceMappingURL=diagnostics.d.ts.map