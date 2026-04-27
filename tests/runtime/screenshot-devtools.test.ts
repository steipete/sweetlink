import { describe, expect, it, vi } from "vitest";

const noop = () => {
  /* suppress console noise */
};

const writeFileMock = vi.fn().mockResolvedValue(undefined);

vi.mock("node:fs/promises", () => ({
  writeFile: writeFileMock,
}));

const connectMock = vi.fn();
const pageBringToFrontMock = vi.fn().mockResolvedValue(undefined);
const elementScreenshotMock = vi.fn().mockResolvedValue(Buffer.from("element-shot"));
const elementBoundingBoxMock = vi.fn().mockResolvedValue({ width: 120, height: 60 });
const pageEvaluateMock = vi.fn().mockResolvedValue({ width: 1600, height: 900 });

const browserMock = {
  pages: vi.fn().mockResolvedValue([
    {
      url: () => "https://app.example.dev/dashboard",
      bringToFront: pageBringToFrontMock,
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      $: vi.fn().mockResolvedValue({
        screenshot: elementScreenshotMock,
        boundingBox: elementBoundingBoxMock,
      }),
      evaluate: pageEvaluateMock,
      screenshot: vi.fn().mockResolvedValue(Buffer.from("full-shot")),
    },
  ]),
  disconnect: vi.fn().mockResolvedValue(undefined),
};

connectMock.mockResolvedValue(browserMock);

vi.mock("puppeteer", () => ({
  default: {
    connect: connectMock,
  },
}));

const runCodexImagePromptMock = vi.fn().mockResolvedValue(0);

vi.mock("../../src/codex", () => ({
  runCodexImagePrompt: runCodexImagePromptMock,
}));

const fetchMock = vi.fn();
// @ts-expect-error overwrite global fetch for the tested module
global.fetch = fetchMock;

const screenshotModule = await import("../../src/runtime/screenshot");
const { attemptDevToolsCapture, tryDevToolsRecovery } = screenshotModule;

describe("attemptDevToolsCapture", () => {
  it("connects to DevTools and captures element screenshots", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });

    const result = await attemptDevToolsCapture({
      devtoolsUrl: "http://localhost:9222/",
      sessionUrl: "https://app.example.dev/dashboard",
      selector: "#top-posters",
      quality: 0.75,
      mode: "element",
      outputPath: "/tmp/output.jpg",
    });

    expect(result).toEqual({
      width: 120,
      height: 60,
      sizeKb: Buffer.from("element-shot").length / 1024,
      renderer: "puppeteer",
    });
    expect(writeFileMock).toHaveBeenCalledWith("/tmp/output.jpg", expect.any(Buffer), {
      mode: 0o600,
    });
  });
});

describe("tryDevToolsRecovery", () => {
  it("logs recovery details when the Puppeteer fallback succeeds", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    const logInfo = vi.fn();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(noop);

    const recovered = await tryDevToolsRecovery({
      sessionUrl: "https://app.example.dev/dashboard",
      devtoolsUrl: "http://localhost:9222/",
      selector: "#top-posters",
      quality: 0.8,
      mode: "element",
      outputPath: "/tmp/output.jpg",
      prompt: "Summarize latest metrics",
      suppressOutput: false,
      failureReason: "renderer timeout",
      logInfo,
      appLabel: "Ops Console",
    });

    expect(recovered).toBe(true);
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining("renderer timeout"));
    expect(runCodexImagePromptMock).toHaveBeenCalledWith("/tmp/output.jpg", expect.any(String));

    consoleSpy.mockRestore();
  });
});
