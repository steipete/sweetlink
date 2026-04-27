import { regex } from "arkregex";
import { type CommandExecutor, createCommandExecutor } from "./commands/index.js";
import { createHookRunner, createScreenshotHooks } from "./screenshot/index.js";
import { stripDataUrlPrefix } from "./screenshot/renderers/dom-to-image.js";
import { commandSelectorSummary } from "./screenshot/targets.js";
import { createSessionStorageAdapter } from "./storage/session-storage.js";
import type {
  SweetLinkLogger,
  SweetLinkScreenshotHooks,
  SweetLinkStatusAdapter,
  SweetLinkStorageAdapter,
} from "./types.js";
import {
  type ActiveSweetLinkSession,
  DEFAULT_STATUS_SNAPSHOT,
  type SweetLinkClient,
  type SweetLinkClientOptions,
  type SweetLinkCommandResult,
  type SweetLinkHandshakeResponse,
  type SweetLinkServerCommandMessage,
  type SweetLinkServerMessage,
  type SweetLinkSessionBootstrap,
  type SweetLinkStatusSnapshot,
} from "./types.js";
import { getConsoleMethod, setConsoleMethod } from "./utils/console.js";
import { getBrowserWindow } from "./utils/environment.js";
import { describeUnknown, toError } from "./utils/errors.js";
import { sanitizeResult } from "./utils/sanitize.js";
import { normalizeExpiresAtMs } from "./utils/time.js";

const UNAUTHORIZED_PATTERN = regex.as("401");

const defaultLogger: SweetLinkLogger = {
  info: (message, ...details) => {
    if (details.length > 0) {
      console.info(message, ...details);
    } else {
      console.info(message);
    }
  },
  warn: (message, error) => {
    if (error) {
      console.warn(message, toError(error));
    } else {
      console.warn(message);
    }
  },
  error: (message, error) => {
    console.error(message, toError(error));
  },
};

type MutableActiveSweetLinkSession = {
  -readonly [Key in keyof ActiveSweetLinkSession]: ActiveSweetLinkSession[Key];
};

interface NormalizedOptions {
  readonly storage: SweetLinkStorageAdapter;
  readonly status: SweetLinkStatusAdapter;
  readonly logger: SweetLinkLogger;
  readonly screenshot: SweetLinkScreenshotHooks;
  readonly windowRef: Window | null;
  readonly autoReconnectHandshake?: () => Promise<SweetLinkHandshakeResponse>;
  readonly maxReconnectAttempts: number;
  readonly reconnectBaseDelayMs: number;
}

class SweetLinkBrowserClient implements SweetLinkClient {
  private currentSession: MutableActiveSweetLinkSession | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private lastReconnectLogAt = 0;
  private consoleFlushTimer: number | null = null;
  private consolePatched = false;

  private readonly storage: SweetLinkStorageAdapter;
  private readonly status: SweetLinkStatusAdapter;
  private readonly logger: SweetLinkLogger;
  private readonly screenshot: SweetLinkScreenshotHooks;
  private readonly windowRef: Window | null;
  private readonly autoReconnectHandshake?: () => Promise<SweetLinkHandshakeResponse>;
  private readonly maxReconnectAttempts: number;
  private readonly reconnectBaseDelayMs: number;
  private readonly commandExecutor: CommandExecutor;

  constructor(options: NormalizedOptions) {
    this.storage = options.storage;
    this.status = options.status;
    this.logger = options.logger;
    this.screenshot = options.screenshot;
    this.windowRef = options.windowRef;
    this.autoReconnectHandshake = options.autoReconnectHandshake;
    this.maxReconnectAttempts = options.maxReconnectAttempts;
    this.reconnectBaseDelayMs = options.reconnectBaseDelayMs;
    this.commandExecutor = createCommandExecutor({ screenshotHooks: this.screenshot });
    this.status.onStatusSnapshot?.(DEFAULT_STATUS_SNAPSHOT);
  }

  async startSession(bootstrap: SweetLinkSessionBootstrap): Promise<void> {
    if (
      this.currentSession &&
      this.currentSession.sessionId === bootstrap.sessionId &&
      this.currentSession.socket &&
      this.currentSession.socket.readyState === WebSocket.OPEN
    ) {
      return;
    }

    if (this.currentSession) {
      this.teardown("replaced", { scheduleReconnect: false });
    }

    const expiresAtMs =
      typeof bootstrap.expiresAtMs === "number" && Number.isFinite(bootstrap.expiresAtMs)
        ? bootstrap.expiresAtMs
        : null;

    this.currentSession = {
      sessionId: bootstrap.sessionId,
      sessionToken: bootstrap.sessionToken,
      socketUrl: bootstrap.socketUrl,
      expiresAtMs,
      socket: null,
      heartbeatTimer: null,
      consoleBuffer: [],
      codename: bootstrap.codename ?? null,
    };

    this.storage.save({
      sessionId: this.currentSession.sessionId,
      sessionToken: this.currentSession.sessionToken,
      socketUrl: this.currentSession.socketUrl,
      expiresAtMs: this.currentSession.expiresAtMs ?? null,
      codename: this.currentSession.codename ?? null,
    });

    if (this.windowRef) {
      const clientWindow = this.windowRef as Window & {
        __sweetlink__?: ActiveSweetLinkSession | null;
        __sweetlinkAutoReconnectEnabled?: boolean;
      };
      clientWindow.__sweetlink__ = this.currentSession;
      clientWindow.__sweetlinkAutoReconnectEnabled = true;
      if (this.reconnectTimer !== null) {
        clientWindow.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    }
    this.reconnectAttempts = 0;
    this.lastReconnectLogAt = 0;
    this.announceStatus("connecting");

    this.screenshot.preloadLibraries().catch((error: unknown) => {
      this.logger.warn("[SweetLink] Failed to preload screenshot libraries", error);
    });

    await this.openSocket();
  }

  teardown(reason = "manual", options: { scheduleReconnect?: boolean } = {}): void {
    const { scheduleReconnect = true } = options;
    if (!this.currentSession) {
      return;
    }
    if (this.windowRef && this.currentSession.heartbeatTimer !== null) {
      this.windowRef.clearInterval(this.currentSession.heartbeatTimer);
    }
    this.currentSession.heartbeatTimer = null;
    if (this.currentSession.socket && this.currentSession.socket.readyState === WebSocket.OPEN) {
      this.currentSession.socket.close();
    }
    this.logger.info("[SweetLink] session ended", reason);
    this.announceStatus("idle", { reason });
    if (scheduleReconnect) {
      this.scheduleAutoReconnect(reason);
    }
    this.currentSession = null;
    if (this.windowRef) {
      const clientWindow = this.windowRef as Window & {
        __sweetlink__?: ActiveSweetLinkSession | null;
      };
      clientWindow.__sweetlink__ = null;
    }
  }

  getCurrentSession(): ActiveSweetLinkSession | null {
    return this.currentSession;
  }

  private async openSocket(): Promise<void> {
    if (!this.currentSession) {
      throw new Error("SweetLink session not initialized");
    }

    const { socketUrl, sessionId, sessionToken } = this.currentSession;
    const sessionReference = this.currentSession;
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(socketUrl);

      const cleanup = () => {
        socket.removeEventListener("open", handleOpen);
        socket.removeEventListener("message", handleMessage);
        socket.removeEventListener("error", handleError);
        socket.removeEventListener("close", handleClose);
      };

      const handleOpen = () => {
        if (
          !this.currentSession ||
          this.currentSession !== sessionReference ||
          this.currentSession.sessionId !== sessionId
        ) {
          cleanup();
          socket.close();
          if (!this.currentSession || this.currentSession.sessionId !== sessionId) {
            resolve();
          } else {
            reject(new Error("SweetLink session missing during open"));
          }
          return;
        }
        this.currentSession.socket = socket;
        this.sendRegisterMessage(socket, sessionId, sessionToken);
        this.startHeartbeat();
        this.patchConsole();
        this.announceStatus("connected");
        resolve();
      };

      const handleMessage = (event: MessageEvent) => {
        try {
          const parsedPayload: unknown = JSON.parse(event.data as string);
          if (!parsedPayload || typeof parsedPayload !== "object") {
            return;
          }
          const payload = parsedPayload as SweetLinkServerMessage;
          this.logger.info("[SweetLink] server message kind", (payload as { kind?: unknown }).kind);
          if (payload.kind === "command") {
            this.handleServerCommand(payload).catch((error: unknown) => {
              this.logger.error("[SweetLink] command error", error);
            });
            return;
          }
          if (payload.kind === "metadata") {
            this.handleMetadataMessage(payload);
            return;
          }
          const disconnectDetails = payload.reason ? ` Reason: ${payload.reason}` : "";
          this.logger.warn(`[SweetLink] server requested disconnect.${disconnectDetails}`);
          socket.close();
        } catch (error: unknown) {
          this.logger.error("[SweetLink] failed to parse server message", error);
        }
      };

      const handleError = (event: Event) => {
        cleanup();
        const message = (event as ErrorEvent).message || "unknown error";
        this.announceStatus("error", { reason: message });
        reject(new Error(`SweetLink socket error: ${message}`));
      };

      const handleClose = (event: CloseEvent) => {
        cleanup();
        const closeInfo = { code: event.code, reason: event.reason, wasClean: event.wasClean };
        this.logger.warn("[SweetLink] socket closed", closeInfo);
        this.teardown(
          `socket closed (${closeInfo.code}${closeInfo.reason ? `: ${closeInfo.reason}` : ""})`,
        );
      };

      socket.addEventListener("open", handleOpen, { once: true });
      socket.addEventListener("message", handleMessage);
      socket.addEventListener("error", handleError);
      socket.addEventListener("close", handleClose);
    });
  }

  private sendRegisterMessage(socket: WebSocket, sessionId: string, sessionToken: string) {
    const clientWindow = this.windowRef ?? getBrowserWindow();
    let topOrigin = clientWindow?.location.origin ?? "";
    try {
      if (clientWindow?.top?.location) {
        topOrigin = clientWindow.top.location.origin;
      }
    } catch {
      /* ignore cross-origin access */
    }
    const payload = {
      kind: "register" as const,
      sessionId,
      token: sessionToken,
      url: clientWindow?.location.href ?? "",
      title: clientWindow?.document?.title ?? "",
      topOrigin,
      userAgent: clientWindow?.navigator?.userAgent ?? "",
      width: clientWindow?.innerWidth ?? 0,
      height: clientWindow?.innerHeight ?? 0,
    };
    socket.send(JSON.stringify(payload));
  }

  private async handleServerCommand(message: SweetLinkServerCommandMessage) {
    const result = await this.commandExecutor.execute(message.command);
    this.postCommandResult(message.sessionId, result);
  }

  private postCommandResult(sessionId: string, result: SweetLinkCommandResult) {
    if (!this.currentSession?.socket || this.currentSession.socket.readyState !== WebSocket.OPEN) {
      this.logger.warn("[SweetLink] socket not ready for command response");
      return;
    }
    const payload = {
      kind: "commandResult" as const,
      sessionId,
      result,
    };
    this.currentSession.socket.send(JSON.stringify(payload));
  }

  private handleMetadataMessage(payload: Extract<SweetLinkServerMessage, { kind: "metadata" }>) {
    if (this.windowRef) {
      const debugWindow = this.windowRef as Window & {
        __sweetlinkMetadataEvents?: Array<{ at: number; payload: SweetLinkServerMessage }>;
      };
      debugWindow.__sweetlinkMetadataEvents ??= [];
      debugWindow.__sweetlinkMetadataEvents.push({ at: Date.now(), payload });
    }
    let targetSession: MutableActiveSweetLinkSession | null = null;
    if (this.currentSession && this.currentSession.sessionId === payload.sessionId) {
      targetSession = this.currentSession;
    } else if (this.windowRef) {
      const windowSession =
        (this.windowRef as Window & { __sweetlink__?: ActiveSweetLinkSession | null })
          .__sweetlink__ ?? null;
      if (windowSession && windowSession.sessionId === payload.sessionId) {
        targetSession = windowSession as MutableActiveSweetLinkSession;
      }
    }
    if (targetSession) {
      const trimmedCodename = typeof payload.codename === "string" ? payload.codename.trim() : "";
      const resolvedCodename = trimmedCodename.length > 0 ? trimmedCodename : null;
      targetSession.codename = resolvedCodename;
      this.announceStatus("connected", { codename: resolvedCodename });
    }
  }

  private startHeartbeat() {
    if (!(this.currentSession && this.windowRef)) {
      return;
    }
    const clientWindow = this.windowRef;
    if (this.currentSession.heartbeatTimer !== null) {
      clientWindow.clearInterval(this.currentSession.heartbeatTimer);
    }
    this.currentSession.heartbeatTimer = clientWindow.setInterval(() => {
      if (
        !this.currentSession?.socket ||
        this.currentSession.socket.readyState !== WebSocket.OPEN
      ) {
        return;
      }
      const payload = {
        kind: "heartbeat" as const,
        sessionId: this.currentSession.sessionId,
      };
      this.currentSession.socket.send(JSON.stringify(payload));
    }, 5000);
  }

  private patchConsole() {
    if (this.consolePatched) {
      return;
    }
    this.consolePatched = true;
    const consoleWithLevels = console;
    for (const consoleLevel of ["log", "info", "warn", "error"] as const) {
      const originalLevelFunction = getConsoleMethod(consoleWithLevels, consoleLevel);
      if (typeof originalLevelFunction !== "function") {
        continue;
      }
      const patchedLevel: Console[typeof consoleLevel] = ((...consoleArguments: unknown[]) => {
        if (this.currentSession) {
          this.currentSession.consoleBuffer.push({
            id: `${consoleLevel}-${Date.now().toString()}-${Math.random().toString(16).slice(2)}`,
            timestamp: Date.now(),
            level: consoleLevel,
            args: consoleArguments.map((item) => sanitizeResult(item)),
          });
          if (this.currentSession.consoleBuffer.length > 200) {
            this.currentSession.consoleBuffer.splice(
              0,
              this.currentSession.consoleBuffer.length - 200,
            );
          }
          this.flushConsoleBuffer();
        }
        const typedArguments = consoleArguments as Parameters<Console[typeof consoleLevel]>;
        originalLevelFunction.apply(console, typedArguments);
      }) as Console[typeof consoleLevel];

      setConsoleMethod(consoleWithLevels, consoleLevel, patchedLevel);
    }
  }

  private flushConsoleBuffer() {
    if (!this.currentSession?.socket || this.currentSession.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    if (!this.windowRef) {
      return;
    }
    if (this.consoleFlushTimer !== null) {
      return;
    }
    const clientWindow = this.windowRef;
    this.consoleFlushTimer = clientWindow.setTimeout(() => {
      this.consoleFlushTimer = null;
      if (
        !this.currentSession?.socket ||
        this.currentSession.socket.readyState !== WebSocket.OPEN
      ) {
        return;
      }
      if (this.currentSession.consoleBuffer.length === 0) {
        return;
      }
      const events = this.currentSession.consoleBuffer.splice(0);
      const payload = {
        kind: "console" as const,
        sessionId: this.currentSession.sessionId,
        events,
      };
      this.currentSession.socket.send(JSON.stringify(payload));
    }, 500);
  }

  private scheduleAutoReconnect(reason: string) {
    if (!this.windowRef) {
      return;
    }
    const clientWindow = this.windowRef as Window & { __sweetlinkAutoReconnectEnabled?: boolean };
    if (!clientWindow.__sweetlinkAutoReconnectEnabled) {
      return;
    }
    if (this.reconnectTimer !== null) {
      return;
    }
    const delayMs = Math.min(this.reconnectBaseDelayMs * 2 ** this.reconnectAttempts, 15_000);
    const now = Date.now();
    if (now - this.lastReconnectLogAt >= 5000 || this.reconnectAttempts === 0) {
      this.logger.info(
        `[SweetLink] scheduling reconnect. Reason: ${reason}. Delay: ${delayMs}ms. Attempt: ${this.reconnectAttempts + 1}.`,
      );
      this.lastReconnectLogAt = now;
    }
    this.reconnectTimer = clientWindow.setTimeout(() => {
      this.reconnectTimer = null;
      this.attemptAutoReconnect().catch((error: unknown) => {
        this.logger.warn("[SweetLink] auto-reconnect failed", error);
      });
    }, delayMs);
  }

  private async attemptAutoReconnect(): Promise<void> {
    if (!this.windowRef) {
      return;
    }
    const clientWindow = this.windowRef as Window & { __sweetlinkAutoReconnectEnabled?: boolean };
    if (!clientWindow.__sweetlinkAutoReconnectEnabled) {
      return;
    }
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.announceStatus("error", { reason: "Auto-reconnect failed: maximum retries reached" });
      clientWindow.__sweetlinkAutoReconnectEnabled = false;
      return;
    }
    this.reconnectAttempts += 1;
    this.announceStatus("connecting");
    try {
      const storedSession = this.storage.load();
      if (storedSession && (this.storage.isFresh?.(storedSession) ?? true)) {
        try {
          await this.startSession({
            sessionId: storedSession.sessionId,
            sessionToken: storedSession.sessionToken,
            socketUrl: storedSession.socketUrl,
            expiresAtMs: storedSession.expiresAtMs ?? null,
            codename: storedSession.codename ?? null,
          });
          return;
        } catch (resumeError) {
          this.logger.warn("[SweetLink] failed to resume stored session", resumeError);
          this.storage.clear();
        }
      }
      if (!this.autoReconnectHandshake) {
        throw new Error("Auto-reconnect handshake is not configured");
      }
      const handshakePayload = await this.autoReconnectHandshake();
      await this.startSession({
        sessionId: handshakePayload.sessionId,
        sessionToken: handshakePayload.sessionToken,
        socketUrl: handshakePayload.socketUrl,
        expiresAtMs: normalizeExpiresAtMs(handshakePayload.expiresAt),
        codename: handshakePayload.codename ?? null,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (UNAUTHORIZED_PATTERN.test(message)) {
        clientWindow.__sweetlinkAutoReconnectEnabled = false;
        this.storage.clear();
        this.announceStatus("error", {
          reason: "SweetLink authentication required. Reopen the menu.",
        });
        return;
      }
      this.announceStatus("error", { reason: `Auto-reconnect failed: ${message}` });
      this.scheduleAutoReconnect("retry-after-error");
    }
  }

  private announceStatus(
    status: "idle" | "connecting" | "connected" | "error",
    detail: { reason?: unknown; codename?: string | null } = {},
  ) {
    const normalizedStatus = status === "idle" ? "idle" : status;
    const reason =
      normalizedStatus === "error" && detail.reason != null
        ? describeUnknown(detail.reason).trim() || null
        : null;
    let codename: string | null = null;
    if (normalizedStatus === "connected") {
      if (typeof detail.codename === "string") {
        const trimmed = detail.codename.trim();
        codename = trimmed.length > 0 ? trimmed : null;
      }
      if (!codename && this.currentSession?.codename) {
        const trimmed = this.currentSession.codename.trim();
        codename = trimmed.length > 0 ? trimmed : null;
      }
    }
    const snapshot: SweetLinkStatusSnapshot = { status: normalizedStatus, reason, codename };
    this.status.onStatusSnapshot?.(snapshot);
    if (this.windowRef) {
      const clientWindow = this.windowRef as Window & {
        __sweetlinkStatusHistory?: Array<{ at: number; status: SweetLinkStatusSnapshot }>;
      };
      clientWindow.__sweetlinkStatusHistory ??= [];
      clientWindow.__sweetlinkStatusHistory.push({
        at: Date.now(),
        status: snapshot,
      });
    }
    if (this.status.historyRecorder) {
      this.status.historyRecorder({ at: Date.now(), snapshot });
    }
    if (this.status.dispatchEvent && this.windowRef) {
      this.status.dispatchEvent(snapshot);
    } else if (this.windowRef) {
      this.windowRef.dispatchEvent(new CustomEvent("sweetlink:status", { detail: snapshot }));
    }
    if (normalizedStatus === "connected" && codename) {
      this.storage.updateCodename?.(codename);
    }
  }
}

export function createSweetLinkClient(options: SweetLinkClientOptions = {}): SweetLinkClient {
  const windowRef = options.windowRef ?? getBrowserWindow();
  const storage = options.storage ?? createSessionStorageAdapter({ windowRef });
  const screenshot = options.screenshot ?? createScreenshotHooks();
  const logger = options.logger ?? defaultLogger;
  const status = options.status ?? {};

  const normalized: NormalizedOptions = {
    storage,
    status,
    logger,
    screenshot,
    windowRef,
    autoReconnectHandshake: options.autoReconnectHandshake,
    maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
    reconnectBaseDelayMs: options.reconnectBaseDelayMs ?? 1500,
  };

  return new SweetLinkBrowserClient(normalized);
}

export const sweetLinkBrowserTestHelpers = {
  createHookRunner,
  stripDataUrlPrefix,
  commandSelectorSummary,
};
