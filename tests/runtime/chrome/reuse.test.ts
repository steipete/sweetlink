import { beforeEach, describe, expect, it, vi } from "vitest";

const saveDevToolsConfigMock = vi.fn();
const loadDevToolsConfigMock = vi.fn();

const cliEnvMock: { devtoolsUrl: string | null } = { devtoolsUrl: null };
vi.mock("../../../src/env", () => ({
  cliEnv: cliEnvMock,
}));

vi.mock("../../../src/runtime/devtools", () => ({
  loadDevToolsConfig: loadDevToolsConfigMock,
  saveDevToolsConfig: saveDevToolsConfigMock,
}));

const discoverDevToolsEndpointsMock = vi.fn();
vi.mock("../../../src/runtime/devtools/cdp", () => ({
  discoverDevToolsEndpoints: discoverDevToolsEndpointsMock,
}));

const urlsRoughlyMatchMock = vi.fn();
vi.mock("../../../src/runtime/url", () => ({
  urlsRoughlyMatch: urlsRoughlyMatchMock,
}));

const primeControlledChromeCookiesMock = vi.fn();
vi.mock("../../../src/runtime/chrome/cookies", () => ({
  primeControlledChromeCookies: primeControlledChromeCookiesMock,
}));

const connectPuppeteerBrowserMock = vi.fn();
const navigatePuppeteerPageMock = vi.fn();
vi.mock("../../../src/runtime/chrome/puppeteer", () => ({
  connectPuppeteerBrowser: connectPuppeteerBrowserMock,
  navigatePuppeteerPage: navigatePuppeteerPageMock,
}));

vi.mock("puppeteer", () => ({
  default: {},
}));

const availabilityQueue: boolean[] = [];

const createServer = () => {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {
    error: [],
    listening: [],
  };
  const server = {
    once(event: "error" | "listening", handler: () => void) {
      listeners[event].push(handler);
      return server;
    },
    listen() {
      const next = availabilityQueue.shift();
      const available = next === undefined ? true : next;
      setImmediate(() => {
        if (available) {
          for (const fn of listeners.listening) {
            fn();
          }
        } else {
          for (const fn of listeners.error) {
            fn(new Error("busy"));
          }
        }
      });
      return server;
    },
    close(cb?: () => void) {
      cb?.();
      return server;
    },
  };
  return server;
};

vi.mock("node:net", () => ({
  default: { createServer },
  createServer,
}));

const {
  reuseExistingControlledChrome,
  extractPortFromUrl,
  persistDevToolsReuse,
  findAvailablePort,
} = await import("../../../src/runtime/chrome/reuse");

describe("extractPortFromUrl", () => {
  it("parses explicit ports and protocol defaults", () => {
    expect(extractPortFromUrl("http://localhost:5000")).toBe(5000);
    expect(extractPortFromUrl("https://example.dev/app")).toBe(443);
    expect(extractPortFromUrl("http://example.dev/app")).toBe(80);
    expect(extractPortFromUrl("invalid-url")).toBeNull();
  });
});

describe("persistDevToolsReuse", () => {
  beforeEach(() => {
    saveDevToolsConfigMock.mockReset();
    saveDevToolsConfigMock.mockResolvedValue(undefined);
  });

  it("uses provided port and persists user data directory hint", async () => {
    const dir = await persistDevToolsReuse(
      "http://localhost:9222",
      9555,
      "https://example.dev",
      "/tmp/profile",
    );

    expect(dir).toBe("/tmp/profile");
    expect(saveDevToolsConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        devtoolsUrl: "http://localhost:9222",
        port: 9555,
        userDataDir: "/tmp/profile",
      }),
    );
  });

  it("falls back to derived port and default directory when hint is missing", async () => {
    const dir = await persistDevToolsReuse("http://localhost:9333", null, "https://example.dev");

    expect(dir).toBe("[external-profile]");
    expect(saveDevToolsConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        devtoolsUrl: "http://localhost:9333",
        port: 9333,
        userDataDir: "[external-profile]",
      }),
    );
  });

  it("returns hint when port cannot be derived", async () => {
    const dir = await persistDevToolsReuse(
      "not-a-url",
      null,
      "https://example.dev",
      "/tmp/fallback",
    );
    expect(dir).toBe("/tmp/fallback");
    expect(saveDevToolsConfigMock).not.toHaveBeenCalled();
  });
});

describe("findAvailablePort", () => {
  it("returns the first available port in the range", async () => {
    availabilityQueue.length = 0;
    availabilityQueue.push(false, true);

    const port = await findAvailablePort(4400, 4402);
    expect(port).toBe(4401);
  });

  it("throws when no ports are available", async () => {
    availabilityQueue.length = 0;
    availabilityQueue.push(false);

    await expect(findAvailablePort(4400, 4400)).rejects.toThrow("No available DevTools port found");
  });
});

describe("reuseExistingControlledChrome", () => {
  beforeEach(() => {
    cliEnvMock.devtoolsUrl = null;
    loadDevToolsConfigMock.mockReset();
    loadDevToolsConfigMock.mockResolvedValue(null);
    saveDevToolsConfigMock.mockReset();
    saveDevToolsConfigMock.mockResolvedValue(undefined);
    discoverDevToolsEndpointsMock.mockReset();
    discoverDevToolsEndpointsMock.mockResolvedValue([]);
    connectPuppeteerBrowserMock.mockReset();
    navigatePuppeteerPageMock.mockReset();
    urlsRoughlyMatchMock.mockReset();
    primeControlledChromeCookiesMock.mockReset();
  });

  it("reuses an existing tab from persisted config and primes cookies without reload", async () => {
    loadDevToolsConfigMock.mockResolvedValue({
      devtoolsUrl: "http://127.0.0.1:9333/",
      userDataDir: "/tmp/profile",
    });
    urlsRoughlyMatchMock.mockReturnValue(true);
    const page = {
      url: () => "https://app.example.dev/home",
      reload: vi.fn().mockResolvedValue(undefined),
      bringToFront: vi.fn().mockResolvedValue(undefined),
    } as unknown as import("puppeteer").Page;
    const browser = {
      pages: vi.fn().mockResolvedValue([page]),
      newPage: vi.fn(),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };
    connectPuppeteerBrowserMock.mockResolvedValue(browser);
    primeControlledChromeCookiesMock.mockResolvedValue(undefined);

    const result = await reuseExistingControlledChrome("https://app.example.dev/home", {
      cookieSync: true,
      bringToFront: true,
    });

    expect(result).toEqual({
      devtoolsUrl: "http://127.0.0.1:9333",
      targetAlreadyOpen: true,
      userDataDir: "/tmp/profile",
    });
    expect(page.reload).toHaveBeenCalled();
    expect(page.bringToFront).toHaveBeenCalled();
    expect(primeControlledChromeCookiesMock).toHaveBeenCalledWith({
      devtoolsUrl: "http://127.0.0.1:9333",
      targetUrl: "https://app.example.dev/home",
      reload: false,
      context: "existing-tab",
    });
    expect(saveDevToolsConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        devtoolsUrl: "http://127.0.0.1:9333",
        userDataDir: "/tmp/profile",
        port: 9333,
      }),
    );
    expect(browser.disconnect).toHaveBeenCalled();
  });

  it("opens a new tab when no match exists and reloads cookies for new contexts", async () => {
    cliEnvMock.devtoolsUrl = "http://localhost:9555";
    urlsRoughlyMatchMock.mockReturnValue(false);
    const newPage = {
      url: () => "about:blank",
      bringToFront: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as import("puppeteer").Page;
    const browser = {
      pages: vi.fn().mockResolvedValue([]),
      newPage: vi.fn().mockResolvedValue(newPage),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };
    connectPuppeteerBrowserMock.mockResolvedValue(browser);
    navigatePuppeteerPageMock.mockResolvedValue(true);
    primeControlledChromeCookiesMock.mockResolvedValue(undefined);

    const result = await reuseExistingControlledChrome("https://app.example.dev/dashboard", {
      cookieSync: true,
      preferredPort: 9555,
    });

    expect(result).toEqual({
      devtoolsUrl: "http://localhost:9555",
      targetAlreadyOpen: false,
      userDataDir: "[external-profile]",
    });
    expect(browser.newPage).toHaveBeenCalled();
    expect(navigatePuppeteerPageMock).toHaveBeenCalledWith(
      newPage,
      "https://app.example.dev/dashboard",
      3,
    );
    expect(primeControlledChromeCookiesMock).toHaveBeenCalledWith({
      devtoolsUrl: "http://localhost:9555",
      targetUrl: "https://app.example.dev/dashboard",
      reload: true,
      context: "new-tab",
    });
  });
});
