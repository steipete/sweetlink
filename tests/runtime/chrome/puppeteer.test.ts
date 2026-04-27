import { beforeEach, describe, expect, it, vi } from "vitest";

const noop = () => {
  /* suppress console noise */
};

const delayMock = vi.fn().mockResolvedValue(undefined);
const logDebugErrorMock = vi.fn();

vi.mock("../../../src/util/time", () => ({
  delay: delayMock,
}));

vi.mock("../../../src/util/errors", () => ({
  logDebugError: logDebugErrorMock,
}));

const {
  connectPuppeteerBrowser,
  resolvePuppeteerPage,
  navigatePuppeteerPage,
  waitForPageReady,
  attemptPuppeteerReload,
} = await import("../../../src/runtime/chrome/puppeteer");

describe("connectPuppeteerBrowser", () => {
  beforeEach(() => {
    delayMock.mockClear();
  });

  it("attaches on the first attempt", async () => {
    const puppeteer = {
      connect: vi.fn().mockResolvedValue({ id: "browser" }),
    } as unknown as typeof import("puppeteer").default;

    const browser = await connectPuppeteerBrowser(puppeteer, "http://localhost:9222", 1);

    expect(browser).toEqual({ id: "browser" });
    expect(puppeteer.connect).toHaveBeenCalledTimes(1);
    expect(delayMock).not.toHaveBeenCalled();
  });

  it("retries before giving up and logs when no browser is available", async () => {
    const puppeteer = {
      connect: vi.fn().mockRejectedValue(new Error("offline")),
    } as unknown as typeof import("puppeteer").default;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);

    const browser = await connectPuppeteerBrowser(puppeteer, "http://localhost:9222", 3);

    expect(browser).toBeNull();
    expect(delayMock).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(
      "Unable to connect to DevTools endpoint at",
      "http://localhost:9222",
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });
});

describe("resolvePuppeteerPage", () => {
  beforeEach(() => {
    delayMock.mockClear();
  });

  it("polls until a matching page is discovered", async () => {
    const firstPage = { url: () => "https://example.dev/dashboard" } as const;
    const targetPage = { url: () => "https://example.dev/settings" } as const;
    const browser = {
      pages: vi
        .fn()
        .mockResolvedValueOnce([firstPage])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([targetPage]),
    } as unknown as import("puppeteer").Browser;

    const resolved = await resolvePuppeteerPage(browser, "https://example.dev/settings");

    expect(resolved).toBe(targetPage);
    expect(delayMock).toHaveBeenCalledTimes(2);
  });
});

describe("navigatePuppeteerPage", () => {
  it("returns true when navigation succeeds", async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
    } as unknown as import("puppeteer").Page;

    await expect(navigatePuppeteerPage(page, "https://example.dev", 1)).resolves.toBe(true);
    expect(page.goto).toHaveBeenCalledWith(
      "https://example.dev",
      expect.objectContaining({ waitUntil: "domcontentloaded" }),
    );
  });

  it("logs debug output after repeated failures", async () => {
    const page = {
      goto: vi.fn().mockRejectedValue(new Error("timeout")),
    } as unknown as import("puppeteer").Page;

    const result = await navigatePuppeteerPage(page, "https://example.dev", 2);

    expect(result).toBe(false);
    expect(logDebugErrorMock).toHaveBeenCalledWith(
      "Unable to navigate controlled Chrome tab to target",
      expect.any(Error),
    );
  });
});

describe("waitForPageReady", () => {
  it("falls back to the secondary readyState when the primary check fails", async () => {
    const page = {
      waitForFunction: vi
        .fn()
        .mockRejectedValueOnce(new Error("slow"))
        .mockResolvedValueOnce(undefined),
    } as unknown as import("puppeteer").Page;

    await waitForPageReady(page);

    expect(page.waitForFunction).toHaveBeenCalledTimes(2);
  });
});

describe("attemptPuppeteerReload", () => {
  it("reports reload failures via debug logs", async () => {
    const page = {
      reload: vi.fn().mockRejectedValue(new Error("crash")),
    } as unknown as import("puppeteer").Page;

    await attemptPuppeteerReload(page);

    expect(logDebugErrorMock).toHaveBeenCalledWith(
      "Reloading the controlled tab failed",
      expect.any(Error),
    );
  });
});
