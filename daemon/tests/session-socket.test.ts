import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type WebSocket from "ws";
import {
  signSweetLinkToken,
  SWEETLINK_HEARTBEAT_INTERVAL_MS,
  SWEETLINK_HEARTBEAT_TOLERANCE_MS,
} from "../../shared/src/index.js";
import { SweetLinkState } from "../src/server.js";

class FakeSocket {
  readyState = 1;
  terminated = false;
  sent: Array<{ kind: string; command?: { id: string } }> = [];
  private messageHandler: ((data: string) => void) | null = null;
  private closeHandler: ((code: number, reason: Buffer) => void) | null = null;

  on(event: string, handler: (data: string) => void): void {
    if (event === "message") this.messageHandler = handler;
  }

  once(event: string, handler: (code: number, reason: Buffer) => void): void {
    if (event === "close") this.closeHandler = handler;
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  terminate(): void {
    this.terminated = true;
    this.readyState = 3;
    queueMicrotask(() => this.closeHandler?.(1000, Buffer.from("")));
  }

  message(payload: Record<string, unknown>): void {
    this.messageHandler?.(JSON.stringify(payload));
  }

  register(sessionId: string): void {
    const token = signSweetLinkToken({
      secret,
      scope: "session",
      subject: "browser",
      ttlSeconds: 60,
      sessionId,
    });
    this.message({
      kind: "register",
      token,
      sessionId,
      url: "https://example.test",
      title: "Example",
      userAgent: "test",
      topOrigin: "https://example.test",
    });
  }
}

const secret = "sweetlink-test-secret";
function attach(state: SweetLinkState): FakeSocket {
  const socket = new FakeSocket();
  state.handleSocket(socket as unknown as WebSocket);
  return socket;
}
function result(socket: FakeSocket, sessionId: string, commandId: string): void {
  socket.message({
    kind: "commandResult",
    sessionId,
    result: { ok: true, commandId, durationMs: 1, data: "pong" },
  });
}

describe("session sockets", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("keeps the new socket when the replaced socket closes", async () => {
    const state = new SweetLinkState(secret);
    const first = attach(state);
    const second = attach(state);
    first.register("session-1");
    const pending = state.sendCommand("session-1", { type: "ping" });
    void pending.catch(() => undefined);
    second.register("session-1");
    await Promise.resolve();
    expect(first.terminated).toBe(true);
    expect(state.listSessions()).toHaveLength(1);
    expect(state.listSessions()[0]?.socketState).toBe("open");
    await expect(pending).rejects.toThrow(/replaced by a new socket/);
  });

  it("rejects pending commands when heartbeat expiry runs", async () => {
    const state = new SweetLinkState(secret);
    const socket = attach(state);
    socket.register("session-2");
    let failure: Error | undefined;
    void state.sendCommand("session-2", { type: "ping" }, 120_000).catch((error: Error) => {
      failure = error;
    });
    vi.setSystemTime(Date.now() + SWEETLINK_HEARTBEAT_TOLERANCE_MS + 1);
    vi.advanceTimersByTime(SWEETLINK_HEARTBEAT_INTERVAL_MS);
    await Promise.resolve();
    expect(failure?.message).toMatch(/missed heartbeats/);
    expect(state.listSessions()).toHaveLength(0);
    expect(socket.terminated).toBe(true);
  });

  it("preserves pending commands on repeated registration of the same socket", async () => {
    const state = new SweetLinkState(secret);
    const socket = attach(state);
    socket.register("session-3");
    const codename = state.listSessions()[0]?.codename;
    const pending = state.sendCommand("session-3", { type: "ping" });
    const commandId = socket.sent.at(-1)?.command?.id;
    socket.register("session-3");
    expect(socket.terminated).toBe(false);
    expect(state.listSessions()[0]?.pendingCommandCount).toBe(1);
    expect(state.listSessions()[0]?.codename).toBe(codename);
    result(socket, "session-3", commandId!);
    await expect(pending).resolves.toMatchObject({ data: "pong" });
  });

  it("ignores command results from unregistered and replaced sockets", async () => {
    const state = new SweetLinkState(secret);
    const first = attach(state);
    const second = attach(state);
    const unregistered = attach(state);
    first.register("session-4");
    second.register("session-4");
    const pending = state.sendCommand("session-4", { type: "ping" });
    const commandId = second.sent.at(-1)?.command?.id;
    result(first, "session-4", commandId!);
    result(unregistered, "session-4", commandId!);
    expect(state.listSessions()[0]?.pendingCommandCount).toBe(1);
    result(second, "session-4", commandId!);
    await expect(pending).resolves.toMatchObject({ data: "pong" });
  });
});
