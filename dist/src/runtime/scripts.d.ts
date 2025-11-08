import type { SweetLinkCommandResult } from '../../shared/src/index.js';
export interface RunJsOptions {
    code?: string[];
    file?: string;
    captureConsole?: boolean;
    timeout: number;
}
/** Resolve inline or file-based JavaScript payloads for run-js commands. */
export declare function resolveScript(options: RunJsOptions, inline?: string[]): Promise<string>;
/** Loads an optional beforeScript snippet for screenshot hooks. */
export declare function resolveHookSnippet(value?: string): Promise<string | null>;
/** Pretty-prints a command result to stdout. */
export declare function renderCommandResult(result: SweetLinkCommandResult): void;
/** Formats unknown result payloads safely for logging. */
export declare function formatResultData(value: unknown): string;
//# sourceMappingURL=scripts.d.ts.map