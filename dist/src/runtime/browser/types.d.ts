import type { SweetLinkConsoleEvent as SharedSweetLinkConsoleEvent, SweetLinkCommand, SweetLinkScreenshotResultData } from '@sweetlink/shared';
export type SweetLinkClientStatus = 'idle' | 'connecting' | 'connected' | 'error';
export interface SweetLinkStatusSnapshot {
    readonly status: SweetLinkClientStatus;
    readonly reason: string | null;
    readonly codename: string | null;
}
export declare const DEFAULT_STATUS_SNAPSHOT: SweetLinkStatusSnapshot;
export interface SweetLinkSessionBootstrap {
    readonly sessionId: string;
    readonly sessionToken: string;
    readonly socketUrl: string;
    readonly expiresAtMs?: number | null;
    readonly codename?: string | null;
}
export interface SweetLinkHandshakeResponse extends SweetLinkSessionBootstrap {
    readonly expiresAt?: number | null;
}
export interface SweetLinkStoredSession {
    readonly sessionId: string;
    readonly sessionToken: string;
    readonly socketUrl: string;
    readonly expiresAtMs: number | null;
    readonly codename: string | null;
}
export interface SweetLinkStorageAdapter {
    load(): SweetLinkStoredSession | null;
    save(session: SweetLinkStoredSession): void;
    clear(): void;
    updateCodename?(codename: string | null): void;
    isFresh?(session: SweetLinkStoredSession, now?: number): boolean;
}
export interface SweetLinkStatusAdapter {
    readonly dispatchEvent?: (snapshot: SweetLinkStatusSnapshot) => void;
    readonly onStatusSnapshot?: (snapshot: SweetLinkStatusSnapshot) => void;
    readonly historyRecorder?: (entry: {
        at: number;
        snapshot: SweetLinkStatusSnapshot;
    }) => void;
}
export interface SweetLinkLogger {
    info(message: string, ...details: unknown[]): void;
    warn(message: string, error?: unknown): void;
    error(message: string, error: unknown): void;
}
export interface SweetLinkScreenshotHooks {
    preloadLibraries(): Promise<void>;
    captureScreenshot(command: Extract<SweetLinkCommand, {
        type: 'screenshot';
    }>, targetInfo: ScreenshotTargetInfo): Promise<SweetLinkScreenshotResultData>;
    resolveTarget(command: Extract<SweetLinkCommand, {
        type: 'screenshot';
    }>): ScreenshotTargetInfo;
    applyPreHooks(command: Extract<SweetLinkCommand, {
        type: 'screenshot';
    }>, targetInfo: ScreenshotTargetInfo): Promise<void>;
}
export interface SweetLinkBrowserEnvironment {
    readonly windowRef?: Window | null;
    readonly documentRef?: Document | null;
}
export interface SweetLinkClientOptions extends SweetLinkBrowserEnvironment {
    readonly storage?: SweetLinkStorageAdapter;
    readonly status?: SweetLinkStatusAdapter;
    readonly logger?: SweetLinkLogger;
    readonly screenshot?: SweetLinkScreenshotHooks;
    readonly onConsoleEvents?: (events: SharedSweetLinkConsoleEvent[]) => void;
    readonly autoReconnectHandshake?: () => Promise<SweetLinkHandshakeResponse>;
    readonly maxReconnectAttempts?: number;
    readonly reconnectBaseDelayMs?: number;
}
export interface SweetLinkClient {
    startSession(bootstrap: SweetLinkSessionBootstrap): Promise<void>;
    teardown(reason?: string, options?: {
        scheduleReconnect?: boolean;
    }): void;
    getCurrentSession(): ActiveSweetLinkSession | null;
}
export type ActiveSweetLinkSession = Omit<SweetLinkSessionBootstrap, 'codename'> & {
    socket: WebSocket | null;
    heartbeatTimer: number | null;
    consoleBuffer: SharedSweetLinkConsoleEvent[];
    codename: string | null;
};
export interface ScreenshotTargetInfo {
    readonly base: HTMLElement;
    readonly target: HTMLElement;
    readonly clip?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}
export type { SweetLinkCommand, SweetLinkCommandResult, SweetLinkConsoleEvent, SweetLinkScreenshotRenderer, SweetLinkScreenshotResultData, SweetLinkServerCommandMessage, SweetLinkServerMessage, } from '@sweetlink/shared';
//# sourceMappingURL=types.d.ts.map