import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const noop = () => {
  /* silence expected warnings in tests */
};

const mocks = vi.hoisted(() => ({
  state: {
    throwPuppeteerImport: false,
  },
  fetchDevToolsTabsWithRetry: vi.fn(),
  evaluateInDevToolsTab: vi.fn(),
  connectPuppeteerBrowser: vi.fn().mockResolvedValue({}),
  resolvePuppeteerPage: vi.fn(),
  navigatePuppeteerPage: vi.fn(),
  waitForPageReady: vi.fn(),
  logDebugError: vi.fn(),
}));

vi.mock("../../src/runtime/devtools/cdp", () => ({
  fetchDevToolsTabsWithRetry: mocks.fetchDevToolsTabsWithRetry,
  evaluateInDevToolsTab: mocks.evaluateInDevToolsTab,
}));

vi.mock("../../src/runtime/chrome/puppeteer", () => ({
  connectPuppeteerBrowser: mocks.connectPuppeteerBrowser,
  resolvePuppeteerPage: mocks.resolvePuppeteerPage,
  navigatePuppeteerPage: mocks.navigatePuppeteerPage,
  waitForPageReady: mocks.waitForPageReady,
}));

vi.mock("../../src/util/errors", () => ({
  logDebugError: mocks.logDebugError,
}));

vi.mock("puppeteer", () => {
  if (mocks.state.throwPuppeteerImport) {
    throw new Error("Missing Puppeteer");
  }
  return { default: {} };
});

async function loadAttemptTwitterOauthAutoAccept() {
  const module = await import("../../src/runtime/devtools/oauth");
  return module.attemptTwitterOauthAutoAccept;
}

const fixturesDir = path.resolve(process.cwd(), "tests/fixtures");
const handlerPath = path.join(fixturesDir, "oauth-handler.ts");
const wrapperHandlerPath = path.join(fixturesDir, "automation-wrapper.ts");
const failingHandlerPath = path.join(fixturesDir, "failing-oauth-handler.ts");
const functionHandlerPath = path.join(fixturesDir, "function-oauth-handler.cjs");
const defaultHandlerPath = path.join(fixturesDir, "default-oauth-handler.ts");
const invalidResultHandlerPath = path.join(fixturesDir, "invalid-result-oauth-handler.ts");
const missingAuthorizeHandlerPath = path.join(fixturesDir, "missing-authorize-oauth-handler.ts");
const connectHandlerPath = path.join(fixturesDir, "connect-puppeteer-handler.ts");

beforeEach(() => {
  vi.resetModules();
  mocks.state.throwPuppeteerImport = false;
  mocks.fetchDevToolsTabsWithRetry.mockReset();
  mocks.evaluateInDevToolsTab.mockReset();
  mocks.connectPuppeteerBrowser.mockReset();
  mocks.connectPuppeteerBrowser.mockResolvedValue({});
  mocks.resolvePuppeteerPage.mockReset();
  mocks.navigatePuppeteerPage.mockReset();
  mocks.waitForPageReady.mockReset();
  mocks.logDebugError.mockReset();
});

describe("attemptTwitterOauthAutoAccept", () => {
  it("returns a handled result when the automation script resolves", async () => {
    const attemptTwitterOauthAutoAccept = await loadAttemptTwitterOauthAutoAccept();

    const result = await attemptTwitterOauthAutoAccept({
      devtoolsUrl: "http://localhost:9222",
      sessionUrl: "https://example.dev/auth",
      scriptPath: handlerPath,
    });

    expect(result).toMatchObject({
      handled: true,
      action: "auto-clicked",
      url: "https://auth.example.dev",
    });
  });

  it("returns a descriptive reason when no script is configured", async () => {
    const attemptTwitterOauthAutoAccept = await loadAttemptTwitterOauthAutoAccept();

    const result = await attemptTwitterOauthAutoAccept({
      devtoolsUrl: "http://localhost:9222",
      sessionUrl: "https://example.dev/auth",
      scriptPath: null,
    });

    expect(result).toEqual({ handled: false, reason: "oauth-handler-not-configured" });
  });

  it("handles automation errors gracefully", async () => {
    const attemptTwitterOauthAutoAccept = await loadAttemptTwitterOauthAutoAccept();

    const result = await attemptTwitterOauthAutoAccept({
      devtoolsUrl: "http://localhost:9222",
      sessionUrl: "https://example.dev/auth",
      scriptPath: failingHandlerPath,
    });

    expect(result).toEqual({ handled: false, reason: "oauth-handler-error" });
  });

  it("supports wrapper exports via normalization", async () => {
    const attemptTwitterOauthAutoAccept = await loadAttemptTwitterOauthAutoAccept();

    const result = await attemptTwitterOauthAutoAccept({
      devtoolsUrl: "http://localhost:9222",
      sessionUrl: "https://example.dev/auth",
      scriptPath: wrapperHandlerPath,
    });

    expect(result).toMatchObject({ handled: true, action: "wrapped-handler" });
  });

  it("warns when an automation script cannot be resolved", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);
    const attemptTwitterOauthAutoAccept = await loadAttemptTwitterOauthAutoAccept();

    const result = await attemptTwitterOauthAutoAccept({
      devtoolsUrl: "http://localhost:9222",
      sessionUrl: "https://example.dev/auth",
      scriptPath: path.join(fixturesDir, "missing-handler.ts"),
    });

    expect(result).toEqual({ handled: false, reason: "oauth-handler-not-found" });
    expect(warnSpy.mock.calls[0]?.[0]).toContain("Failed to load OAuth automation script");
    warnSpy.mockRestore();
  });

  it("supports CommonJS function exports via normalization", async () => {
    const attemptTwitterOauthAutoAccept = await loadAttemptTwitterOauthAutoAccept();

    const result = await attemptTwitterOauthAutoAccept({
      devtoolsUrl: "http://localhost:9222",
      sessionUrl: "https://example.dev/auth",
      scriptPath: functionHandlerPath,
    });

    expect(result).toMatchObject({ handled: true, action: "function-export" });
  });

  it("supports default object exports", async () => {
    const attemptTwitterOauthAutoAccept = await loadAttemptTwitterOauthAutoAccept();

    const result = await attemptTwitterOauthAutoAccept({
      devtoolsUrl: "http://localhost:9222",
      sessionUrl: "https://example.dev/auth",
      scriptPath: defaultHandlerPath,
    });

    expect(result).toMatchObject({ handled: true, action: "default-export" });
  });

  it("returns an invalid-result reason when the handler omits handled flag", async () => {
    const attemptTwitterOauthAutoAccept = await loadAttemptTwitterOauthAutoAccept();

    const result = await attemptTwitterOauthAutoAccept({
      devtoolsUrl: "http://localhost:9222",
      sessionUrl: "https://example.dev/auth",
      scriptPath: invalidResultHandlerPath,
    });

    expect(result).toEqual({ handled: false, reason: "oauth-handler-invalid-result" });
  });

  it("only warns once per missing script path", async () => {
    const attemptTwitterOauthAutoAccept = await loadAttemptTwitterOauthAutoAccept();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);
    const missingPath = path.join(fixturesDir, "missing-handler-two.ts");

    await attemptTwitterOauthAutoAccept({
      devtoolsUrl: "http://localhost:9222",
      sessionUrl: "https://example.dev/auth",
      scriptPath: missingPath,
    });
    await attemptTwitterOauthAutoAccept({
      devtoolsUrl: "http://localhost:9222",
      sessionUrl: "https://example.dev/auth",
      scriptPath: missingPath,
    });

    const notFoundWarnings = warnSpy.mock.calls.filter(
      ([message]) =>
        typeof message === "string" && message.includes("OAuth automation script not found"),
    );
    expect(notFoundWarnings).toHaveLength(1);
    warnSpy.mockRestore();
  });

  it("warns when a script fails to export an authorize function", async () => {
    const attemptTwitterOauthAutoAccept = await loadAttemptTwitterOauthAutoAccept();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);

    const result = await attemptTwitterOauthAutoAccept({
      devtoolsUrl: "http://localhost:9222",
      sessionUrl: "https://example.dev/auth",
      scriptPath: missingAuthorizeHandlerPath,
    });

    expect(result).toEqual({ handled: false, reason: "oauth-handler-not-found" });
    expect(
      warnSpy.mock.calls.some(
        ([message]) =>
          typeof message === "string" && message.includes("does not export an authorize"),
      ),
    ).toBe(true);
    warnSpy.mockRestore();
  });

  it("logs debug errors when Puppeteer import fails inside connectPuppeteer", async () => {
    mocks.state.throwPuppeteerImport = true;
    vi.resetModules();
    const attemptTwitterOauthAutoAccept = await loadAttemptTwitterOauthAutoAccept();

    const result = await attemptTwitterOauthAutoAccept({
      devtoolsUrl: "http://localhost:9222",
      sessionUrl: "https://example.dev/auth",
      scriptPath: connectHandlerPath,
    });

    expect(result).toMatchObject({ handled: true, action: "connect-invoked" });
    expect(mocks.logDebugError).toHaveBeenCalledWith(
      "Unable to load Puppeteer for OAuth automation",
      expect.any(Error),
    );
  });
});
