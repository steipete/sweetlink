export declare const SWEETLINK_DEFAULT_PORT = 4455;
export declare const SWEETLINK_WS_PATH = "/bridge";
export declare const SWEETLINK_SESSION_EXP_SECONDS: number;
export declare const SWEETLINK_CLI_EXP_SECONDS: number;
export declare const SWEETLINK_HEARTBEAT_INTERVAL_MS = 15000;
export declare const SWEETLINK_HEARTBEAT_TOLERANCE_MS = 45000;
export type SweetLinkTokenScope = 'session' | 'cli';
export interface SweetLinkTokenPayload {
    readonly tokenId: string;
    readonly scope: SweetLinkTokenScope;
    readonly sub: string;
    readonly sessionId?: string;
    readonly issuedAt: number;
    readonly expiresAt: number;
}
export interface SignTokenOptions {
    readonly secret: string;
    readonly scope: SweetLinkTokenScope;
    readonly subject: string;
    readonly ttlSeconds: number;
    readonly sessionId?: string;
}
export declare function signSweetLinkToken({ secret, scope, subject, ttlSeconds, sessionId }: SignTokenOptions): string;
export interface VerifyTokenOptions {
    readonly secret: string;
    readonly token: string;
    readonly expectedScope?: SweetLinkTokenScope;
}
export declare function verifySweetLinkToken({ secret, token, expectedScope }: VerifyTokenOptions): SweetLinkTokenPayload;
export declare function createSweetLinkSessionId(): string;
export declare function createSweetLinkCommandId(): string;
export type SweetLinkCommand = SweetLinkRunScriptCommand | SweetLinkGetDomCommand | SweetLinkNavigateCommand | SweetLinkPingCommand | SweetLinkScreenshotCommand | SweetLinkSelectorDiscoveryCommand;
export interface SweetLinkRunScriptCommand {
    readonly type: 'runScript';
    readonly id: string;
    readonly code: string;
    readonly timeoutMs?: number;
    readonly captureConsole?: boolean;
}
export interface SweetLinkGetDomCommand {
    readonly type: 'getDom';
    readonly id: string;
    readonly selector?: string;
    readonly includeShadowDom?: boolean;
}
export interface SweetLinkNavigateCommand {
    readonly type: 'navigate';
    readonly id: string;
    readonly url: string;
}
export interface SweetLinkPingCommand {
    readonly type: 'ping';
    readonly id: string;
}
export interface SweetLinkScreenshotCommand {
    readonly type: 'screenshot';
    readonly id: string;
    readonly mode: 'full' | 'element';
    readonly selector?: string | null;
    readonly quality?: number;
    readonly timeoutMs?: number;
    readonly renderer?: SweetLinkScreenshotRenderer;
    readonly hooks?: readonly SweetLinkScreenshotHook[];
}
export interface SweetLinkSelectorDiscoveryCommand {
    readonly type: 'discoverSelectors';
    readonly id: string;
    readonly scopeSelector?: string | null;
    readonly limit?: number;
    readonly includeHidden?: boolean;
}
export interface SweetLinkScreenshotResultData {
    readonly mimeType: 'image/jpeg';
    readonly base64: string;
    readonly width: number;
    readonly height: number;
    readonly renderer: SweetLinkScreenshotRenderer;
}
export type SweetLinkScreenshotRenderer = 'auto' | 'puppeteer' | 'html2canvas' | 'html-to-image';
export type SweetLinkScreenshotHook = {
    readonly type: 'scrollIntoView';
    readonly selector?: string | null;
    readonly behavior?: 'auto' | 'smooth';
    readonly block?: 'start' | 'center' | 'end' | 'nearest';
} | {
    readonly type: 'waitForSelector';
    readonly selector: string;
    readonly visibility?: 'any' | 'visible';
    readonly timeoutMs?: number;
} | {
    readonly type: 'waitForIdle';
    readonly timeoutMs?: number;
    readonly frameCount?: number;
} | {
    readonly type: 'wait';
    readonly ms: number;
} | {
    readonly type: 'script';
    readonly code: string;
};
export interface SweetLinkSelectorCandidate {
    readonly selector: string;
    readonly tagName: string;
    readonly hook: 'data-target' | 'id' | 'aria' | 'role' | 'structure' | 'testid';
    readonly textSnippet: string;
    readonly score: number;
    readonly visible: boolean;
    readonly size: {
        readonly width: number;
        readonly height: number;
    };
    readonly position: {
        readonly top: number;
        readonly left: number;
    };
    readonly dataTarget?: string | null;
    readonly id?: string | null;
    readonly dataTestId?: string | null;
    readonly path: string;
}
export interface SweetLinkSelectorDiscoveryResult {
    readonly candidates: readonly SweetLinkSelectorCandidate[];
}
export interface SweetLinkCommandResultSuccess {
    readonly ok: true;
    readonly commandId: string;
    readonly durationMs: number;
    readonly data?: unknown;
    readonly console?: readonly SweetLinkConsoleEvent[];
}
export interface SweetLinkCommandResultError {
    readonly ok: false;
    readonly commandId: string;
    readonly durationMs: number;
    readonly error: string;
    readonly stack?: string;
    readonly console?: readonly SweetLinkConsoleEvent[];
}
export type SweetLinkCommandResult = SweetLinkCommandResultSuccess | SweetLinkCommandResultError;
export type SweetLinkConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
export interface SweetLinkConsoleEvent {
    readonly id: string;
    readonly timestamp: number;
    readonly level: SweetLinkConsoleLevel;
    readonly args: readonly unknown[];
}
export interface SweetLinkSessionMetadata {
    readonly sessionId: string;
    readonly userAgent: string;
    readonly url: string;
    readonly title: string;
    readonly topOrigin: string;
    readonly codename: string;
    readonly createdAt: number;
}
export type SweetLinkClientMessage = SweetLinkRegisterMessage | SweetLinkHeartbeatMessage | SweetLinkCommandResultMessage | SweetLinkConsoleStreamMessage;
export interface SweetLinkRegisterMessage {
    readonly kind: 'register';
    readonly token: string;
    readonly sessionId: string;
    readonly url: string;
    readonly title: string;
    readonly userAgent: string;
    readonly topOrigin: string;
}
export interface SweetLinkHeartbeatMessage {
    readonly kind: 'heartbeat';
    readonly sessionId: string;
}
export interface SweetLinkCommandResultMessage {
    readonly kind: 'commandResult';
    readonly sessionId: string;
    readonly result: SweetLinkCommandResult;
}
export interface SweetLinkConsoleStreamMessage {
    readonly kind: 'console';
    readonly sessionId: string;
    readonly events: readonly SweetLinkConsoleEvent[];
}
export type SweetLinkServerMessage = SweetLinkServerCommandMessage | SweetLinkServerMetadataMessage | SweetLinkServerDisconnectMessage;
export interface SweetLinkServerCommandMessage {
    readonly kind: 'command';
    readonly sessionId: string;
    readonly command: SweetLinkCommand;
}
export interface SweetLinkServerMetadataMessage {
    readonly kind: 'metadata';
    readonly sessionId: string;
    readonly codename: string;
}
export interface SweetLinkServerDisconnectMessage {
    readonly kind: 'disconnect';
    readonly reason: string;
}
export interface SweetLinkSessionSummary {
    readonly sessionId: string;
    readonly codename: string;
    readonly url: string;
    readonly title: string;
    readonly topOrigin: string;
    readonly lastSeenAt: number;
    readonly createdAt: number;
    readonly heartbeatMsAgo: number;
    readonly consoleEventsBuffered: number;
    readonly consoleErrorsBuffered: number;
    readonly pendingCommandCount: number;
    readonly socketState: 'open' | 'closing' | 'closed' | 'connecting' | 'unknown';
    readonly userAgent: string;
    readonly lastConsoleEventAt: number | null;
}
//# sourceMappingURL=index.d.ts.map