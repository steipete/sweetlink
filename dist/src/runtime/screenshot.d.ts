import type { SweetLinkCommandResult, SweetLinkScreenshotRenderer } from '../../shared/src/index.js';
import type { CliConfig } from '../types.js';
import type { SweetLinkConsoleDump } from './session.js';
export interface DevToolsCaptureOptions {
    readonly devtoolsUrl: string;
    readonly sessionUrl: string;
    readonly selector?: string;
    readonly quality: number;
    readonly mode: 'full' | 'element';
    readonly outputPath: string;
}
export interface SweetLinkScreenshotResultPayload {
    readonly mimeType: 'image/jpeg';
    readonly base64: string;
    readonly width: number;
    readonly height: number;
    readonly renderer: SweetLinkScreenshotRenderer;
}
export type ScreenshotFallbackContext = {
    readonly config: CliConfig;
    readonly token: string;
    readonly sessionId: string;
    readonly payload: {
        readonly type: 'screenshot';
        readonly id: string;
        readonly mode: 'full' | 'element';
        readonly selector?: string;
        readonly quality: number;
        readonly timeoutMs: number;
        readonly renderer?: SweetLinkScreenshotRenderer;
        readonly hooks?: unknown;
    };
    readonly outputPath: string;
    readonly prompt: string | undefined;
    readonly suppressOutput: boolean;
};
export type HtmlToImageFallbackOutcome = {
    readonly handled: true;
} | {
    readonly handled: false;
    readonly fallbackResult: SweetLinkCommandResult;
};
export type DevToolsRecoveryContext = {
    readonly sessionUrl?: string;
    readonly devtoolsUrl: string;
    readonly selector?: string;
    readonly quality: number;
    readonly mode: 'full' | 'element';
    readonly outputPath: string;
    readonly prompt: string | undefined;
    readonly suppressOutput: boolean;
    readonly logInfo: (...args: unknown[]) => void;
    readonly failureReason?: string | null;
    readonly appLabel?: string;
};
export declare function maybeDescribeScreenshot(prompt: string | undefined, imagePath: string, options?: {
    silent?: boolean;
    appLabel?: string;
}): Promise<void>;
export declare function maybeAnalyzeConsoleWithPrompt(prompt: string | undefined, selector: string, events: SweetLinkConsoleDump[], options?: {
    silent?: boolean;
    appLabel?: string;
}): Promise<boolean>;
export declare function tryHtmlToImageFallback(context: ScreenshotFallbackContext & {
    readonly rendererOverride: SweetLinkScreenshotRenderer;
    readonly failureReason?: string | null;
}): Promise<HtmlToImageFallbackOutcome>;
export declare function attemptDevToolsCapture(options: DevToolsCaptureOptions): Promise<{
    width: number;
    height: number;
    sizeKb: number;
    renderer: 'puppeteer';
} | null>;
export declare function tryDevToolsRecovery(context: DevToolsRecoveryContext): Promise<boolean>;
export declare function persistScreenshotResult(outputPath: string, result: SweetLinkCommandResult, options?: {
    silent?: boolean;
}): Promise<SweetLinkScreenshotResultPayload>;
//# sourceMappingURL=screenshot.d.ts.map