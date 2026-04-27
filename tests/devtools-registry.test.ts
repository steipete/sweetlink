import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const noop = () => {
  /* suppress console noise */
};

const mkdirMock = vi.fn();
const readFileMock = vi.fn();
const writeFileMock = vi.fn();
const readdirMock = vi.fn();

vi.mock("node:fs/promises", () => ({
  mkdir: mkdirMock,
  readFile: readFileMock,
  writeFile: writeFileMock,
  readdir: readdirMock,
}));

vi.mock("node:os", () => ({
  default: { homedir: () => "/tmp", tmpdir: () => "/tmp" },
  homedir: () => "/tmp",
  tmpdir: () => "/tmp",
}));

type ListenerMap = Record<string, Array<(payload?: unknown) => void>>;
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  private listeners: ListenerMap = {};
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
  send(_payload: string) {
    queueMicrotask(() => {
      this.emit("message", { data: JSON.stringify({ id: 1 }) });
    });
  }
  close() {
    queueMicrotask(() => this.emit("close"));
  }
  emit(type: string, payload?: unknown) {
    for (const handler of this.listeners[type] ?? []) {
      handler(payload);
    }
  }
  static reset() {
    MockWebSocket.instances = [];
  }
}

vi.mock("undici", () => ({
  WebSocket: MockWebSocket,
}));

const { registerControlledChromeInstance } = await import("../src/devtools-registry");
const { cleanupControlledChromeRegistry } = await import("../src/devtools-registry");

const nowSpy = vi.spyOn(Date, "now");
const fetchMock = vi.fn();

beforeAll(() => {
  nowSpy.mockReturnValue(1000);
  // @ts-expect-error allow assigning fetch for tests
  globalThis.fetch = fetchMock;
});

afterAll(() => {
  nowSpy.mockRestore();
  // @ts-expect-error clean up global fetch
  globalThis.fetch = undefined;
});

beforeEach(() => {
  mkdirMock.mockResolvedValue(undefined);
  readFileMock.mockReset();
  writeFileMock.mockReset();
  readdirMock.mockReset();
  fetchMock.mockReset();
  MockWebSocket.reset();
});

describe("registerControlledChromeInstance", () => {
  it("ignores entries without SweetLink userData directories", async () => {
    await registerControlledChromeInstance("http://localhost:9222", "/Users/me/chrome-profile");

    expect(readFileMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it("adds a new registry entry when the directory matches the port signature", async () => {
    readFileMock.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));

    await registerControlledChromeInstance(
      "http://localhost:9222",
      "/tmp/sweetlink-chrome-9222-user",
    );

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(writeFileMock.mock.calls[0][1]);
    expect(payload).toEqual([
      {
        devtoolsUrl: "http://localhost:9222",
        userDataDirectory: "/tmp/sweetlink-chrome-9222-user",
        lastSeenAt: 1000,
      },
    ]);
  });

  it("updates an existing registry entry", async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify([
        {
          devtoolsUrl: "http://localhost:9222",
          userDataDirectory: "/tmp/sweetlink-chrome-9222-old",
          lastSeenAt: 500,
        },
      ]),
    );

    await registerControlledChromeInstance(
      "http://localhost:9222",
      "/tmp/sweetlink-chrome-9222-new",
    );

    const payload = JSON.parse(writeFileMock.mock.calls[0][1]);
    expect(payload[0]).toMatchObject({
      devtoolsUrl: "http://localhost:9222",
      userDataDirectory: "/tmp/sweetlink-chrome-9222-new",
      lastSeenAt: 1000,
    });
  });

  it("rejects directories whose embedded port does not match the DevTools URL", async () => {
    await registerControlledChromeInstance(
      "http://localhost:9555",
      "/tmp/sweetlink-chrome-9222-user",
    );
    expect(writeFileMock).not.toHaveBeenCalled();
  });
});

describe("cleanupControlledChromeRegistry", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ webSocketDebuggerUrl: "ws://devtools/session" }),
    });
    readdirMock.mockResolvedValue([]);
  });

  it("updates active entries, closes stale ones, and sweeps lingering directories", async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify([
        {
          devtoolsUrl: "http://localhost:9222/",
          userDataDirectory: "/tmp/sweetlink-chrome-9222-alpha",
          lastSeenAt: 50,
        },
        {
          devtoolsUrl: "http://127.0.0.1:9333",
          userDataDirectory: "/tmp/sweetlink-chrome-9333-beta",
          lastSeenAt: 60,
        },
      ]),
    );
    readdirMock.mockResolvedValue(["sweetlink-chrome-9222-junk", "sweetlink-chrome-9555-temp"]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(noop);

    await cleanupControlledChromeRegistry("http://localhost:9222");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:9333/json/version", { method: "GET" });
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:9555/json/version", { method: "GET" });
    const payload = JSON.parse(writeFileMock.mock.calls.at(-1)[1]);
    expect(payload).toEqual([
      {
        devtoolsUrl: "http://localhost:9222",
        userDataDirectory: "/tmp/sweetlink-chrome-9222-alpha",
        lastSeenAt: 1000,
      },
    ]);
    expect(logSpy).toHaveBeenCalledWith(
      "[SweetLink CLI] Closed lingering Chrome instance at port 9555",
    );
    logSpy.mockRestore();
  });

  it("drops active entries whose directories no longer match the DevTools port", async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify([
        {
          devtoolsUrl: "http://localhost:9222",
          userDataDirectory: "/tmp/sweetlink-chrome-9000-drift",
          lastSeenAt: 25,
        },
      ]),
    );
    readdirMock.mockResolvedValue([]);

    await cleanupControlledChromeRegistry("http://localhost:9222");

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:9000/json/version", { method: "GET" });
    const payload = JSON.parse(writeFileMock.mock.calls.at(-1)[1]);
    expect(payload).toEqual([]);
  });
});
