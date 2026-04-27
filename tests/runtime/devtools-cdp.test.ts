import { regex } from "arkregex";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

beforeAll(() => {
  // @ts-expect-error forcing global mock for tests
  globalThis.fetch = fetchMock;
});

afterAll(() => {
  // @ts-expect-error restore default
  (globalThis as { fetch?: typeof fetch }).fetch = undefined;
});

vi.mock("../../src/util/time", () => ({
  delay: vi.fn().mockResolvedValue(undefined),
}));

import type { ConsoleMessage, JSHandle, Page } from "playwright-core";

const UNEXPECTED_RESPONSE_PATTERN = regex.as("unexpected");
const MISSING_DEBUGGER_PATTERN = regex.as("does not expose");

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  private listeners: Record<string, Array<(payload?: unknown) => void>> = {};
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => this.emit("open"));
  }
  addEventListener(type: string, handler: (payload?: unknown) => void) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type]?.push(handler);
    if (type === "open") {
      queueMicrotask(() => handler());
    }
  }
  send(raw: string) {
    const parsed = JSON.parse(raw);
    const messageId = parsed.id ?? 0;
    const respond = (result: unknown) => {
      const payload = JSON.stringify({ id: messageId, result });
      this.emit("message", { data: payload });
    };
    if (parsed.method === "Runtime.evaluate") {
      const expression = parsed.params?.expression;
      const value = expression === "document.readyState" ? "complete" : "ok";
      respond({ result: { value } });
    } else {
      respond({});
    }
  }
  close() {
    queueMicrotask(() => this.emit("close"));
  }
  private emit(type: string, payload?: unknown) {
    for (const handler of this.listeners[type] ?? []) {
      handler(payload);
    }
  }
}

vi.mock("undici", () => ({
  WebSocket: MockWebSocket,
}));

const devtoolsModule = await import("../../src/runtime/devtools/cdp");
const {
  discoverDevToolsEndpoints,
  fetchDevToolsTabs,
  fetchDevToolsTabsWithRetry,
  evaluateInDevToolsTab,
  resolveDevToolsPage,
  serializeConsoleMessage,
  createEmptyDevToolsState,
  trimBuffer,
} = devtoolsModule;

describe("discoverDevToolsEndpoints", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("returns ports that respond to /json/version", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false })
      .mockRejectedValueOnce(new Error("offline"));

    const endpoints = await discoverDevToolsEndpoints();

    expect(endpoints).toEqual(["http://127.0.0.1:9222"]);
  });
});

describe("fetchDevToolsTabs", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("returns sanitized tab entries", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: "1",
            title: "Timeline",
            url: "https://example.dev/timeline",
            type: "page",
            webSocketDebuggerUrl: "ws://socket",
          },
          { id: null, url: "missing" },
        ]),
    });

    const tabs = await fetchDevToolsTabs("http://localhost:9222");

    expect(tabs).toEqual([
      {
        id: "1",
        title: "Timeline",
        url: "https://example.dev/timeline",
        type: "page",
        webSocketDebuggerUrl: "ws://socket",
      },
    ]);
  });

  it("throws when payload is malformed", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    await expect(fetchDevToolsTabs("http://localhost:9222")).rejects.toThrow(
      UNEXPECTED_RESPONSE_PATTERN,
    );
  });
});

describe("fetchDevToolsTabsWithRetry", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("retries on ECONNREFUSED and returns empty list", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("ECONNREFUSED 127.0.0.1"))
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });

    const tabs = await fetchDevToolsTabsWithRetry("http://localhost:9222", 2);

    expect(tabs).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("resolveDevToolsPage", () => {
  it("finds a page that matches the configured target", () => {
    const pageMatch = { url: () => "https://example.dev/dashboard" } as Page;
    const pageFallback = { url: () => "https://example.dev/home" } as Page;
    const browser = {
      contexts: () => [
        {
          pages: () => [pageFallback, pageMatch],
        },
      ],
    } as unknown as import("playwright-core").Browser;

    const match = resolveDevToolsPage(browser, {
      devtoolsUrl: "http://127.0.0.1:9222",
      targetUrl: "https://example.dev/dashboard",
    });

    expect(match).toBe(pageMatch);
  });

  it("falls back to the first available page when no match exists", () => {
    const pageFallback = { url: () => "https://example.dev/home" } as Page;
    const browser = {
      contexts: () => [{ pages: () => [pageFallback] }],
    } as unknown as import("playwright-core").Browser;

    const match = resolveDevToolsPage(browser, { devtoolsUrl: "http://127.0.0.1:9222" });

    expect(match).toBe(pageFallback);
  });
});

describe("serializeConsoleMessage", () => {
  it("formats console payloads even when jsonValue fails", async () => {
    const handle: JSHandle<unknown> = {
      jsonValue: vi.fn().mockRejectedValue(new Error("nope")),
      evaluate: vi.fn().mockResolvedValue('"fallback"'),
    } as unknown as JSHandle<unknown>;
    const message: ConsoleMessage = {
      args: () => [handle],
      type: () => "error",
      text: () => "Boom",
      location: () => ({ url: "/app", lineNumber: 10, columnNumber: 2 }),
    } as unknown as ConsoleMessage;

    const entry = await serializeConsoleMessage(message);

    expect(entry.type).toBe("error");
    expect(entry.args).toEqual(['"fallback"']);
    expect(handle.evaluate).toHaveBeenCalled();
  });
});

describe("state helpers", () => {
  it("creates empty state snapshots and trims buffers", () => {
    const state = createEmptyDevToolsState("http://localhost:9222");
    expect(state.endpoint).toBe("http://localhost:9222");
    expect(state.console).toEqual([]);

    const buffer = [1, 2, 3, 4];
    trimBuffer(buffer, 2);
    expect(buffer).toEqual([3, 4]);
  });
});

describe("evaluateInDevToolsTab", () => {
  it("evaluates expressions in matching DevTools tabs", async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "1", url: "https://app.example.dev", webSocketDebuggerUrl: "ws://devtools" },
      ],
    });

    const result = await evaluateInDevToolsTab(
      "http://localhost:9222",
      "https://app.example.dev",
      "40 + 2",
    );

    expect(result).toBe("ok");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:9222/json/list", expect.any(Object));
  });

  it("throws when no debugger URL is available", async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: "1", url: "https://other.dev", webSocketDebuggerUrl: undefined }],
    });

    await expect(
      evaluateInDevToolsTab("http://localhost:9222", "https://missing.dev", "1+1"),
    ).rejects.toThrow(MISSING_DEBUGGER_PATTERN);
  });
});
