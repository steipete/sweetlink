import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.fn();
const resolveMock = vi.fn();

vi.mock("@sweetlink-app/runtime/chrome/puppeteer", () => ({
  connectPuppeteerBrowser: connectMock,
  resolvePuppeteerPage: resolveMock,
}));

vi.mock("puppeteer", () => ({
  default: {},
}));

const focusModule = await import("@sweetlink-app/runtime/chrome/focus");
const { focusControlledChromePage } = focusModule;

describe("focusControlledChromePage", () => {
  beforeEach(() => {
    connectMock.mockReset();
    resolveMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("focuses the resolved controlled Chrome page and disconnects the browser", async () => {
    const bringToFront = vi.fn().mockResolvedValue();
    const disconnect = vi.fn().mockResolvedValue();
    const browser = {
      pages: vi.fn().mockResolvedValue([]),
      disconnect,
    };

    connectMock.mockResolvedValue(browser);
    resolveMock.mockResolvedValue({
      bringToFront,
    });

    const result = await focusControlledChromePage(
      "http://127.0.0.1:9222",
      "https://app.example.dev",
    );

    expect(result).toBe(true);
    expect(connectMock).toHaveBeenCalledWith({}, "http://127.0.0.1:9222", 3);
    expect(resolveMock).toHaveBeenCalled();
    expect(bringToFront).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("falls back to the first available page when the target cannot be resolved", async () => {
    const bringToFront = vi.fn().mockResolvedValue();
    const disconnect = vi.fn().mockResolvedValue();
    const page = { bringToFront };
    const browser = {
      pages: vi.fn().mockResolvedValue([page]),
      disconnect,
    };

    connectMock.mockResolvedValue(browser);
    resolveMock.mockResolvedValue(null);

    const result = await focusControlledChromePage(
      "http://127.0.0.1:9223",
      "https://app.example.dev/timeline",
    );

    expect(result).toBe(true);
    expect(browser.pages).toHaveBeenCalledTimes(1);
    expect(bringToFront).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("returns false when no pages can be focused", async () => {
    const disconnect = vi.fn().mockResolvedValue();
    const browser = {
      pages: vi.fn().mockResolvedValue([]),
      disconnect,
    };

    connectMock.mockResolvedValue(browser);
    resolveMock.mockResolvedValue(null);

    const result = await focusControlledChromePage(
      "http://127.0.0.1:9224",
      "https://app.example.dev/insights",
    );

    expect(result).toBe(false);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("returns false when the DevTools connection cannot be established", async () => {
    connectMock.mockResolvedValue(null);

    const result = await focusControlledChromePage(
      "http://127.0.0.1:9225",
      "https://app.example.dev/settings",
    );

    expect(result).toBe(false);
  });
});
