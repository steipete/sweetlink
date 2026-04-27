import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const SWEETLINK_DEFAULT_PORT = 4455;
export const SWEETLINK_WS_PATH = "/bridge";
export const SWEETLINK_SESSION_EXP_SECONDS = 60 * 5; // 5 minutes
export const SWEETLINK_CLI_EXP_SECONDS = 60 * 60; // 1 hour
export const SWEETLINK_HEARTBEAT_INTERVAL_MS = 15_000;
export const SWEETLINK_HEARTBEAT_TOLERANCE_MS = 45_000;

export type SweetLinkTokenScope = "session" | "cli";

export interface SweetLinkTokenPayload {
  readonly tokenId: string;
  readonly scope: SweetLinkTokenScope;
  readonly sub: string;
  readonly sessionId?: string;
  readonly issuedAt: number; // seconds since epoch
  readonly expiresAt: number; // seconds since epoch
}

export interface SignTokenOptions {
  readonly secret: string;
  readonly scope: SweetLinkTokenScope;
  readonly subject: string;
  readonly ttlSeconds: number;
  readonly sessionId?: string;
}

export function signSweetLinkToken({
  secret,
  scope,
  subject,
  ttlSeconds,
  sessionId,
}: SignTokenOptions): string {
  // We encode the payload ourselves (instead of relying on a JWT lib) so both daemon and browser
  // can verify tokens without pulling in heavyweight dependencies.
  if (!secret) {
    throw new Error("SweetLink secret is not configured");
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: SweetLinkTokenPayload = {
    tokenId: randomUUID(),
    scope,
    sub: subject,
    sessionId,
    issuedAt,
    expiresAt: issuedAt + ttlSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signEncodedPayload(secret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export interface VerifyTokenOptions {
  readonly secret: string;
  readonly token: string;
  readonly expectedScope?: SweetLinkTokenScope;
}

export function verifySweetLinkToken({
  secret,
  token,
  expectedScope,
}: VerifyTokenOptions): SweetLinkTokenPayload {
  if (!secret) {
    throw new Error("SweetLink secret is not configured");
  }
  const [encodedPayload, providedSignature] = token.split(".", 2);
  if (!(encodedPayload && providedSignature)) {
    throw new Error("Malformed SweetLink token");
  }
  const expectedSignature = signEncodedPayload(secret, encodedPayload);
  if (
    !timingSafeCompare(
      Buffer.from(providedSignature, "base64url"),
      Buffer.from(expectedSignature, "base64url"),
    )
  ) {
    throw new Error("Invalid SweetLink token signature");
  }
  const decoded = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  ) as SweetLinkTokenPayload;
  if (!decoded || typeof decoded !== "object") {
    throw new Error("Invalid SweetLink token payload");
  }
  const now = Math.floor(Date.now() / 1000);
  if (decoded.expiresAt < now) {
    throw new Error("SweetLink token expired");
  }
  if (expectedScope && decoded.scope !== expectedScope) {
    throw new Error("SweetLink token scope mismatch");
  }
  return decoded;
}

function signEncodedPayload(secret: string, encodedPayload: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function timingSafeCompare(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false;
  }
  try {
    // timingSafeEqual throws if lengths mismatch; handle that here so callers only see false.
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function createSweetLinkSessionId(): string {
  return randomUUID();
}

export function createSweetLinkCommandId(): string {
  return randomUUID();
}

export type SweetLinkCommand =
  | SweetLinkRunScriptCommand
  | SweetLinkGetDomCommand
  | SweetLinkNavigateCommand
  | SweetLinkPingCommand
  | SweetLinkScreenshotCommand
  | SweetLinkSelectorDiscoveryCommand;

export interface SweetLinkRunScriptCommand {
  readonly type: "runScript";
  readonly id: string;
  readonly code: string;
  readonly timeoutMs?: number;
  readonly captureConsole?: boolean;
}

export interface SweetLinkGetDomCommand {
  readonly type: "getDom";
  readonly id: string;
  readonly selector?: string;
  readonly includeShadowDom?: boolean;
}

export interface SweetLinkNavigateCommand {
  readonly type: "navigate";
  readonly id: string;
  readonly url: string;
}

export interface SweetLinkPingCommand {
  readonly type: "ping";
  readonly id: string;
}

export interface SweetLinkScreenshotCommand {
  readonly type: "screenshot";
  readonly id: string;
  readonly mode: "full" | "element";
  readonly selector?: string | null;
  readonly quality?: number;
  readonly timeoutMs?: number;
  readonly renderer?: SweetLinkScreenshotRenderer;
  readonly hooks?: readonly SweetLinkScreenshotHook[];
}

export interface SweetLinkSelectorDiscoveryCommand {
  readonly type: "discoverSelectors";
  readonly id: string;
  readonly scopeSelector?: string | null;
  readonly limit?: number;
  readonly includeHidden?: boolean;
}

export interface SweetLinkScreenshotResultData {
  readonly mimeType: "image/jpeg";
  readonly base64: string;
  readonly width: number;
  readonly height: number;
  readonly renderer: SweetLinkScreenshotRenderer;
}

export type SweetLinkScreenshotRenderer = "auto" | "puppeteer" | "html2canvas" | "html-to-image";

export type SweetLinkScreenshotHook =
  | {
      readonly type: "scrollIntoView";
      readonly selector?: string | null;
      readonly behavior?: "auto" | "smooth";
      readonly block?: "start" | "center" | "end" | "nearest";
    }
  | {
      readonly type: "waitForSelector";
      readonly selector: string;
      readonly visibility?: "any" | "visible";
      readonly timeoutMs?: number;
    }
  | {
      readonly type: "waitForIdle";
      readonly timeoutMs?: number;
      readonly frameCount?: number;
    }
  | {
      readonly type: "wait";
      readonly ms: number;
    }
  | {
      readonly type: "script";
      readonly code: string;
    };

export interface SweetLinkSelectorCandidate {
  readonly selector: string;
  readonly tagName: string;
  readonly hook: "data-target" | "id" | "aria" | "role" | "structure" | "testid";
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

export type SweetLinkConsoleLevel = "log" | "info" | "warn" | "error" | "debug";

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

export type SweetLinkClientMessage =
  | SweetLinkRegisterMessage
  | SweetLinkHeartbeatMessage
  | SweetLinkCommandResultMessage
  | SweetLinkConsoleStreamMessage;

export interface SweetLinkRegisterMessage {
  readonly kind: "register";
  readonly token: string;
  readonly sessionId: string;
  readonly url: string;
  readonly title: string;
  readonly userAgent: string;
  readonly topOrigin: string;
}

export interface SweetLinkHeartbeatMessage {
  readonly kind: "heartbeat";
  readonly sessionId: string;
}

export interface SweetLinkCommandResultMessage {
  readonly kind: "commandResult";
  readonly sessionId: string;
  readonly result: SweetLinkCommandResult;
}

export interface SweetLinkConsoleStreamMessage {
  readonly kind: "console";
  readonly sessionId: string;
  readonly events: readonly SweetLinkConsoleEvent[];
}

export type SweetLinkServerMessage =
  | SweetLinkServerCommandMessage
  | SweetLinkServerMetadataMessage
  | SweetLinkServerDisconnectMessage;

export interface SweetLinkServerCommandMessage {
  readonly kind: "command";
  readonly sessionId: string;
  readonly command: SweetLinkCommand;
}

export interface SweetLinkServerMetadataMessage {
  readonly kind: "metadata";
  readonly sessionId: string;
  readonly codename: string;
}

export interface SweetLinkServerDisconnectMessage {
  readonly kind: "disconnect";
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
  readonly socketState: "open" | "closing" | "closed" | "connecting" | "unknown";
  readonly userAgent: string;
  readonly lastConsoleEventAt: number | null;
}
