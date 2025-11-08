import type { SweetLinkConsoleDump } from './runtime/session.js';
/** Asks Codex about a screenshot file. */
export declare function runCodexImagePrompt(imagePath: string, prompt: string): Promise<number>;
/** Asks Codex about a text payload. */
export declare function runCodexTextPrompt(prompt: string): Promise<number>;
/** Helper for summarising console dumps via Codex. */
export declare function analyzeConsoleWithCodex(selector: string, prompt: string, events: SweetLinkConsoleDump[], options?: {
    silent?: boolean;
    appLabel?: string;
}): Promise<boolean>;
//# sourceMappingURL=codex.d.ts.map