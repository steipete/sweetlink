import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/http", () => ({
  fetchJson: vi.fn(),
}));
vi.mock("../../../src/util/time", () => ({
  delay: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/runtime/devtools", () => ({
  saveDevToolsConfig: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/util/errors", () => ({
  logDebugError: vi.fn(),
}));

const httpModule = await import("../../../src/http");
const fetchJson = vi.mocked(httpModule.fetchJson);
const timeModule = await import("../../../src/util/time");
const delay = vi.mocked(timeModule.delay);
const devtoolsModule = await import("../../../src/runtime/devtools");
const saveDevToolsConfig = vi.mocked(devtoolsModule.saveDevToolsConfig);
const errorsModule = await import("../../../src/util/errors");
const logDebugError = vi.mocked(errorsModule.logDebugError);

const { waitForSweetLinkSession, signalSweetLinkBootstrap } =
  await import("../../../src/runtime/chrome/session");

beforeEach(() => {
  fetchJson.mockReset();
  delay.mockReset();
  delay.mockResolvedValue(undefined);
  saveDevToolsConfig.mockReset();
  logDebugError.mockReset();
});

const config = {
  appLabel: "Example App",
  appBaseUrl: "https://app.example.dev",
  daemonBaseUrl: "https://daemon.local",
  adminApiKey: "test",
  oauthScriptPath: null,
  servers: {},
};

describe("waitForSweetLinkSession", () => {
  it("returns immediately when token is missing", async () => {
    const result = await waitForSweetLinkSession({
      config,
      token: null,
      targetUrl: "https://app.example.dev/timeline",
      timeoutSeconds: 5,
    });
    expect(result).toBeNull();
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it("resolves the matching session and saves DevTools metadata once", async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      sessions: [
        { sessionId: "123", url: "https://app.example.dev/timeline" },
        { sessionId: "456", url: "https://app.example.dev/insights" },
      ],
    });

    const result = await waitForSweetLinkSession({
      config,
      token: "token",
      targetUrl: "https://app.example.dev/timeline",
      timeoutSeconds: 5,
      devtoolsUrl: "http://127.0.0.1:9222",
    });

    expect(result).toEqual({ sessionId: "123", url: "https://app.example.dev/timeline" });
    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(saveDevToolsConfig).toHaveBeenCalledWith({
      devtoolsUrl: "http://127.0.0.1:9222",
      sessionId: "123",
    });
  });

  it("polls until timeout when no matching session appears", async () => {
    vi.mocked(fetchJson)
      .mockResolvedValueOnce({ sessions: [] })
      .mockResolvedValueOnce({ sessions: [] })
      .mockResolvedValue({ sessions: [] });

    const result = await waitForSweetLinkSession({
      config,
      token: "token",
      targetUrl: "https://app.example.dev/timeline",
      timeoutSeconds: 1,
    });

    expect(result).toBeNull();
    expect(delay).toHaveBeenCalled();
  });
});

describe("signalSweetLinkBootstrap", () => {
  const fetchMock = vi.fn();

  beforeAll(() => {
    // @ts-expect-error define fetch for tests
    global.fetch = fetchMock;
  });

  afterAll(() => {
    // @ts-expect-error cleanup fetch
    global.fetch = undefined;
  });

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("posts the bootstrap payload when both requests succeed", async () => {
    fetchMock.mockResolvedValue({ ok: true });

    await signalSweetLinkBootstrap("http://localhost:9222", "https://app.example.dev");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:9222/json/version", {
      method: "GET",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://app.example.dev/sweetlink/bootstrap",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(body).toEqual({
      devtoolsUrl: "http://localhost:9222",
      targetUrl: "https://app.example.dev",
    });
  });

  it("logs debug errors when the bootstrap request fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));

    await signalSweetLinkBootstrap("http://localhost:9222", "https://app.example.dev/dashboard");

    expect(logDebugError).toHaveBeenCalledWith(
      "Failed to signal SweetLink bootstrap",
      expect.any(Error),
    );
  });
});
