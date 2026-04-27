import { beforeEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.fn();
const resolvePageMock = vi.fn();
const waitForReadyMock = vi.fn();

vi.mock("../../../src/runtime/chrome/puppeteer", () => ({
  connectPuppeteerBrowser: connectMock,
  resolvePuppeteerPage: resolvePageMock,
  waitForPageReady: waitForReadyMock,
}));

vi.mock("puppeteer", () => ({
  default: {},
}));

const { collectPuppeteerDiagnostics } = await import("../../../src/runtime/chrome/diagnostics");

describe("collectPuppeteerDiagnostics", () => {
  beforeEach(() => {
    connectMock.mockReset();
    resolvePageMock.mockReset();
    waitForReadyMock.mockReset();
    waitForReadyMock.mockResolvedValue(undefined);
  });

  it("returns null when the DevTools browser is unavailable", async () => {
    connectMock.mockResolvedValue(null);

    const result = await collectPuppeteerDiagnostics(
      "http://localhost:9222",
      "https://example.dev",
    );

    expect(result).toBeNull();
    expect(resolvePageMock).not.toHaveBeenCalled();
  });

  it("returns null when no matching page is discovered", async () => {
    connectMock.mockResolvedValue({ disconnect: vi.fn() });
    resolvePageMock.mockResolvedValue(null);

    const result = await collectPuppeteerDiagnostics(
      "http://localhost:9222",
      "https://example.dev",
    );

    expect(result).toBeNull();
  });

  it("captures overlay, body, and title text when evaluation succeeds", async () => {
    const disconnectMock = vi.fn();
    const evaluate = vi
      .fn()
      .mockResolvedValue({ overlayText: "Boom", bodyText: "Body", title: "Title" });
    connectMock.mockResolvedValue({ disconnect: disconnectMock });
    resolvePageMock.mockResolvedValue({ evaluate });

    const result = await collectPuppeteerDiagnostics(
      "http://localhost:9222",
      "https://example.dev",
    );

    expect(waitForReadyMock).toHaveBeenCalled();
    expect(evaluate).toHaveBeenCalled();
    expect(disconnectMock).toHaveBeenCalled();
    expect(result).toEqual({ overlayText: "Boom", bodyText: "Body", title: "Title" });
  });

  it("swallows evaluation errors and still disconnects", async () => {
    const disconnectMock = vi.fn();
    connectMock.mockResolvedValue({ disconnect: disconnectMock });
    resolvePageMock.mockResolvedValue({ evaluate: vi.fn().mockRejectedValue(new Error("fail")) });

    const result = await collectPuppeteerDiagnostics(
      "http://localhost:9222",
      "https://example.dev",
    );

    expect(result).toBeNull();
    expect(disconnectMock).toHaveBeenCalled();
  });
});
