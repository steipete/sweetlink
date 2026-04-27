import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const browser = {
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
  const evaluate = vi.fn().mockResolvedValue({
    overlayText: null,
    bodyText: "Diagnostics ready",
    title: "Test Page",
  });
  const page = { evaluate };
  return {
    browser,
    evaluate,
    page,
    connectPuppeteerBrowser: vi.fn().mockResolvedValue(browser),
    resolvePuppeteerPage: vi.fn().mockResolvedValue(page),
    waitForPageReady: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../../src/runtime/chrome/puppeteer", () => ({
  connectPuppeteerBrowser: mocks.connectPuppeteerBrowser,
  resolvePuppeteerPage: mocks.resolvePuppeteerPage,
  waitForPageReady: mocks.waitForPageReady,
}));

vi.mock("puppeteer", () => ({
  default: {},
}));

function resetDiagnosticsMocks(): void {
  mocks.connectPuppeteerBrowser.mockReset();
  mocks.connectPuppeteerBrowser.mockResolvedValue(mocks.browser);
  mocks.resolvePuppeteerPage.mockReset();
  mocks.resolvePuppeteerPage.mockResolvedValue({ evaluate: mocks.evaluate });
  mocks.waitForPageReady.mockReset();
  mocks.waitForPageReady.mockResolvedValue(undefined);
  mocks.evaluate.mockReset();
  mocks.evaluate.mockResolvedValue({
    overlayText: null,
    bodyText: "Diagnostics ready",
    title: "Test Page",
  });
  mocks.browser.disconnect.mockClear();
}

async function loadCollectDiagnostics() {
  const module = await import("../../src/runtime/chrome/diagnostics");
  return module.collectPuppeteerDiagnostics;
}

beforeEach(() => {
  vi.resetModules();
  resetDiagnosticsMocks();
});

describe("collectPuppeteerDiagnostics", () => {
  it("returns overlay diagnostics when the page is resolved", async () => {
    const collectPuppeteerDiagnostics = await loadCollectDiagnostics();

    const result = await collectPuppeteerDiagnostics(
      "http://localhost:9222",
      "https://app.example.dev",
    );

    expect(result).toEqual({
      overlayText: null,
      bodyText: "Diagnostics ready",
      title: "Test Page",
    });
    expect(mocks.waitForPageReady).toHaveBeenCalled();
    expect(mocks.browser.disconnect).toHaveBeenCalled();
  });

  it("ignores readiness errors before evaluating the page", async () => {
    mocks.waitForPageReady.mockRejectedValueOnce(new Error("timeout"));
    const collectPuppeteerDiagnostics = await loadCollectDiagnostics();

    const result = await collectPuppeteerDiagnostics(
      "http://localhost:9222",
      "https://app.example.dev",
    );

    expect(result).toEqual({
      overlayText: null,
      bodyText: "Diagnostics ready",
      title: "Test Page",
    });
  });

  it("returns null when Puppeteer cannot resolve the page", async () => {
    mocks.resolvePuppeteerPage.mockResolvedValueOnce(null);
    const collectPuppeteerDiagnostics = await loadCollectDiagnostics();

    const result = await collectPuppeteerDiagnostics(
      "http://localhost:9222",
      "https://app.example.dev",
    );

    expect(result).toBeNull();
  });

  it("returns null when Puppeteer cannot connect to the browser", async () => {
    mocks.connectPuppeteerBrowser.mockResolvedValueOnce(null);
    const collectPuppeteerDiagnostics = await loadCollectDiagnostics();

    const result = await collectPuppeteerDiagnostics(
      "http://localhost:9222",
      "https://app.example.dev",
    );

    expect(result).toBeNull();
  });
});
