import type { Request } from 'playwright-core';
import type { DevToolsConsoleEntry, DevToolsNetworkEntry, SweetLinkBootstrapDiagnostics } from './types.js';
export declare function logBootstrapDiagnostics(label: string, diagnostics: SweetLinkBootstrapDiagnostics): void;
export declare function logDevtoolsConsoleSummary(label: string, entries: readonly DevToolsConsoleEntry[], limit?: number): void;
export declare function diagnosticsContainBlockingIssues(diagnostics: SweetLinkBootstrapDiagnostics): boolean;
export declare function formatConsoleArg(value: unknown): string;
export declare function createNetworkEntryFromRequest(request: Request, status?: number, failureText?: string): DevToolsNetworkEntry;
//# sourceMappingURL=diagnostics.d.ts.map