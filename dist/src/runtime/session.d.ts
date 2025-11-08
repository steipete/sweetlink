import type { SweetLinkSelectorCandidate, SweetLinkSelectorDiscoveryResult } from '../../shared/src/index.js';
import { type SweetLinkCommandResult } from '../../shared/src/index.js';
import type { CliConfig } from '../types.js';
export interface SweetLinkSessionSummaryResponse {
    readonly sessions: Array<{
        readonly sessionId: string;
        readonly codename?: string;
        readonly url: string;
        readonly title: string;
        readonly topOrigin: string;
        readonly createdAt: number;
        readonly lastSeenAt: number;
        readonly heartbeatMsAgo?: number;
        readonly consoleEventsBuffered?: number;
        readonly consoleErrorsBuffered?: number;
        readonly pendingCommandCount?: number;
        readonly socketState?: 'open' | 'closing' | 'closed' | 'connecting' | 'unknown';
        readonly userAgent?: string;
        readonly lastConsoleEventAt?: number | null;
    }>;
}
export type SweetLinkSessionSummary = SweetLinkSessionSummaryResponse['sessions'][number];
export interface SweetLinkConsoleDump {
    readonly id: string;
    readonly timestamp: number;
    readonly level: string;
    readonly args: unknown[];
}
export interface RunScriptCommandOptions {
    readonly sessionId: string;
    readonly code: string;
    readonly timeoutMs: number;
    readonly captureConsole?: boolean;
}
export interface BuildClickScriptOptions {
    readonly selector: string;
    readonly scrollIntoView: boolean;
    readonly bubbles: boolean;
}
export declare function fetchSessionSummaries(config: CliConfig, existingToken?: string): Promise<SweetLinkSessionSummary[]>;
/** Formats a session id + codename pair for CLI display. */
export declare function formatSessionHeadline(session: {
    sessionId: string;
    codename?: string;
}): string;
/** Resolves a human codename or short id to an active SweetLink session. */
export declare function resolveSessionIdFromHint(sessionHint: string, config: CliConfig): Promise<string>;
/** Sends a SweetLink runScript command and returns the raw command result. */
export declare function executeRunScriptCommand(config: CliConfig, options: RunScriptCommandOptions): Promise<SweetLinkCommandResult>;
/** Returns recent console events captured for a SweetLink session. */
export declare function fetchConsoleEvents(config: CliConfig, sessionId: string): Promise<SweetLinkConsoleDump[]>;
export declare function getSessionSummaryById(config: CliConfig, token: string, sessionId: string): Promise<SweetLinkSessionSummary | undefined>;
/** Returns the resolved prompt string for CLI commands. */
export declare function resolvePromptOption(options: {
    prompt?: string;
    question?: string;
}): string | undefined;
/** Builds a DOM click script scoped to the provided selector. */
export declare function buildClickScript({ selector, scrollIntoView, bubbles }: BuildClickScriptOptions): string;
/** Shared guard ensuring candidates from selector discovery are valid. */
export declare const isSweetLinkSelectorCandidate: (value: unknown) => value is SweetLinkSelectorCandidate;
/** Wrapper guards selector discovery responses. */
export declare const isSweetLinkSelectorDiscoveryResult: (value: unknown) => value is SweetLinkSelectorDiscoveryResult;
//# sourceMappingURL=session.d.ts.map