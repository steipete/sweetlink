import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SweetLinkCommandResult, SweetLinkScreenshotRenderer } from "../../shared/src";
import type { ScreenshotFallbackContext } from "../../src/runtime/screenshot";
import type { CliConfig } from "../../src/types";

const noop = () => {
  /* suppress console noise during tests */
};

const mocks = vi.hoisted(() => ({
  runCodexImagePrompt: vi.fn<(path: string, prompt: string) => Promise<number>>(),
  runCodexTextPrompt: vi.fn<(prompt: string) => Promise<number>>(),
  fetchJson: vi.fn(),
}));

vi.mock("../../src/codex", () => ({
  runCodexImagePrompt: mocks.runCodexImagePrompt,
  runCodexTextPrompt: mocks.runCodexTextPrompt,
}));

vi.mock("../../src/http", () => ({
  fetchJson: mocks.fetchJson,
}));

const screenshotModule = await import("../../src/runtime/screenshot");
const {
  maybeDescribeScreenshot,
  maybeAnalyzeConsoleWithPrompt,
  tryHtmlToImageFallback,
  persistScreenshotResult,
} = screenshotModule;

describe("maybeDescribeScreenshot", () => {
  beforeEach(() => {
    mocks.runCodexImagePrompt.mockReset();
  });

  it("skips invocation when no prompt is provided", async () => {
    await maybeDescribeScreenshot(undefined, "/tmp/output.jpg");

    expect(mocks.runCodexImagePrompt).not.toHaveBeenCalled();
  });

  it("delegates to Codex when a prompt is supplied", async () => {
    mocks.runCodexImagePrompt.mockResolvedValue(0);
    const logSpy = vi.spyOn(console, "log").mockImplementation(noop);

    await maybeDescribeScreenshot("What changed?", "/tmp/screenshot.jpg", {
      appLabel: "Insights Portal",
    });

    expect(logSpy).toHaveBeenCalledWith("Asking Codex about screenshot: What changed?");
    expect(mocks.runCodexImagePrompt).toHaveBeenCalledWith(
      "/tmp/screenshot.jpg",
      expect.stringContaining("Insights Portal"),
    );

    logSpy.mockRestore();
  });

  it("warns when the Codex CLI is missing", async () => {
    const error = new Error("not found");
    (error as NodeJS.ErrnoException).code = "ENOENT";
    mocks.runCodexImagePrompt.mockRejectedValue(error);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);

    await maybeDescribeScreenshot("Explain the issue", "/tmp/screenshot.jpg");

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Codex CLI not found"));
    warnSpy.mockRestore();
  });

  it("logs when Codex exits with a non-zero status code", async () => {
    mocks.runCodexImagePrompt.mockResolvedValue(3);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);

    await maybeDescribeScreenshot("Summarize the graph", "/tmp/screenshot.jpg");

    expect(warnSpy).toHaveBeenCalledWith("Codex exited with status 3.");
    warnSpy.mockRestore();
  });
});

describe("maybeAnalyzeConsoleWithPrompt", () => {
  beforeEach(() => {
    mocks.runCodexTextPrompt.mockReset();
  });

  it("returns false when prompt is empty", async () => {
    const result = await maybeAnalyzeConsoleWithPrompt("   ", "#cta", []);

    expect(result).toBe(false);
    expect(mocks.runCodexTextPrompt).not.toHaveBeenCalled();
  });

  it("records console lines and returns true when Codex succeeds", async () => {
    mocks.runCodexTextPrompt.mockResolvedValue(0);
    const logSpy = vi.spyOn(console, "log").mockImplementation(noop);
    const events = [{ id: "a", timestamp: 1000, level: "error", args: ["boom"] }];

    const result = await maybeAnalyzeConsoleWithPrompt("Why failed?", "#cta", events, {
      appLabel: "Ops Console",
    });

    expect(result).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(
      "Asking Codex about console output after #cta: Why failed?",
    );
    expect(mocks.runCodexTextPrompt).toHaveBeenCalledWith(
      expect.stringContaining("Console output"),
    );

    logSpy.mockRestore();
  });

  it("warns and returns false when Codex exits with a failure code", async () => {
    mocks.runCodexTextPrompt.mockResolvedValue(2);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);

    const result = await maybeAnalyzeConsoleWithPrompt("Still broken?", "#cta", []);

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Codex exited with status 2"));

    warnSpy.mockRestore();
  });

  it("logs a hint when Codex is missing on the system", async () => {
    const error = new Error("missing");
    (error as NodeJS.ErrnoException).code = "ENOENT";
    mocks.runCodexTextPrompt.mockRejectedValue(error);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);

    const result = await maybeAnalyzeConsoleWithPrompt("Need logs", "#cta", []);

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Codex CLI not found"));
    warnSpy.mockRestore();
  });

  it("logs when Codex fails for other reasons", async () => {
    const error = new Error("network timeout");
    mocks.runCodexTextPrompt.mockRejectedValue(error);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);

    const result = await maybeAnalyzeConsoleWithPrompt("Need context", "#cta", []);

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Codex CLI failed: network timeout"),
    );
    warnSpy.mockRestore();
  });
});

describe("persistScreenshotResult", () => {
  it("writes screenshots to disk and reports metadata", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "sweetlink-shot-"));
    const outputPath = path.join(tempDir, "saved.jpg");
    const logSpy = vi.spyOn(console, "log").mockImplementation(noop);
    const payload: SweetLinkCommandResult = {
      ok: true,
      commandId: "cmd-3",
      durationMs: 200,
      data: {
        mimeType: "image/jpeg",
        base64: Buffer.from("image-bytes").toString("base64"),
        width: 1024,
        height: 768,
        renderer: "puppeteer",
      },
    };

    try {
      const result = await persistScreenshotResult(outputPath, payload);

      expect(result).toEqual(payload.data);
      const stored = await readFile(outputPath, "utf8");
      expect(stored).toBe("image-bytes");
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Saved screenshot to"));
    } finally {
      logSpy.mockRestore();
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("throws when the screenshot command fails", async () => {
    const payload: SweetLinkCommandResult = {
      ok: false,
      commandId: "cmd-4",
      durationMs: 100,
      error: "Daemon unavailable",
    };

    await expect(persistScreenshotResult("/tmp/does-not-matter.jpg", payload)).rejects.toThrow(
      "Daemon unavailable",
    );
  });

  it("throws when the command succeeds without returning image data", async () => {
    const payload: SweetLinkCommandResult = {
      ok: true,
      commandId: "cmd-5",
      durationMs: 75,
    };

    await expect(persistScreenshotResult("/tmp/does-not-matter.jpg", payload)).rejects.toThrow(
      "Screenshot succeeded but no image payload was returned.",
    );
  });
});

describe("tryHtmlToImageFallback", () => {
  const config: CliConfig = {
    appLabel: "Ops Console",
    appBaseUrl: "https://example.dev",
    daemonBaseUrl: "https://daemon.dev",
    adminApiKey: null,
    oauthScriptPath: null,
    servers: {},
  };

  const baseContext: ScreenshotFallbackContext & {
    readonly rendererOverride: SweetLinkScreenshotRenderer;
  } = {
    rendererOverride: "puppeteer",
    failureReason: "timeout",
    config,
    token: "cli-token",
    sessionId: "session-123",
    payload: {
      type: "screenshot",
      id: "cmd-1",
      mode: "full",
      selector: undefined,
      quality: 0.9,
      timeoutMs: 30_000,
    },
    outputPath: "/tmp/screenshot.jpg",
    prompt: "Summarize the dashboard",
    suppressOutput: true,
  };

  beforeEach(() => {
    mocks.fetchJson.mockReset();
  });

  it("persists the fallback result and forwards prompts to Codex when html-to-image succeeds", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "sweetlink-shot-"));
    const outputPath = path.join(tempDir, "shot.jpg");
    const successResult: SweetLinkCommandResult = {
      ok: true,
      commandId: "cmd-1",
      durationMs: 1200,
      data: {
        mimeType: "image/jpeg",
        base64: Buffer.from("mock").toString("base64"),
        width: 800,
        height: 600,
        renderer: "html-to-image",
      },
    };
    mocks.fetchJson.mockResolvedValue({ result: successResult });
    mocks.runCodexImagePrompt.mockResolvedValue(0);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);

    try {
      const outcome = await tryHtmlToImageFallback({ ...baseContext, outputPath });

      expect(outcome).toEqual({ handled: true });
      expect(mocks.fetchJson).toHaveBeenCalledWith(
        "https://daemon.dev/sessions/session-123/command",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"renderer":"html-to-image"'),
        }),
      );
      const contents = await readFile(outputPath, "utf8");
      expect(contents).toBe("mock");
      expect(mocks.runCodexImagePrompt).toHaveBeenCalledWith(outputPath, expect.any(String));
    } finally {
      warnSpy.mockRestore();
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("returns the fallback failure state when html-to-image also fails", async () => {
    const failureResult: SweetLinkCommandResult = {
      ok: false,
      commandId: "cmd-2",
      durationMs: 500,
      error: "Renderer crashed",
    };
    mocks.fetchJson.mockResolvedValue({ result: failureResult });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);

    try {
      const outcome = await tryHtmlToImageFallback({
        ...baseContext,
        payload: { ...baseContext.payload, id: "cmd-2" },
      });

      expect(outcome).toEqual({ handled: false, fallbackResult: failureResult });
    } finally {
      warnSpy.mockRestore();
    }
  });
});
