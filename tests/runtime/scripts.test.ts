import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const noop = () => {
  /* suppress console noise */
};

vi.mock("../../src/env", () => ({
  sweetLinkDebug: false,
}));

const { resolveHookSnippet, formatResultData, renderCommandResult } =
  await import("../../src/runtime/scripts");

describe("resolveHookSnippet", () => {
  it("returns null for empty or whitespace-only values", async () => {
    await expect(resolveHookSnippet()).resolves.toBeNull();
    await expect(resolveHookSnippet("   ")).resolves.toBeNull();
  });

  it("returns trimmed inline snippets when provided", async () => {
    await expect(resolveHookSnippet("  window.app.ready = true ")).resolves.toBe(
      "window.app.ready = true",
    );
  });

  it("loads snippets from files prefixed with @", async () => {
    const hookPath = await createTempHook('console.log("from file");');
    await expect(resolveHookSnippet(`@ ${hookPath}`)).resolves.toContain("from file");
  });

  it("loads snippets from file:// URLs", async () => {
    const hookPath = await createTempHook('console.log("via file url");');
    const fileUrl = `file://${hookPath}`;
    await expect(resolveHookSnippet(fileUrl)).resolves.toContain("via file url");
  });

  it("throws when @ is provided without a path", async () => {
    await expect(resolveHookSnippet("@")).rejects.toThrow(
      "Expected a file path after @ for --before-script.",
    );
  });
});

describe("formatResultData", () => {
  it("formats primitive values and nullish inputs", () => {
    expect(formatResultData(undefined)).toBe("(undefined)");
    expect(formatResultData(null)).toBe("null");
    expect(formatResultData("text")).toBe("text");
    expect(formatResultData(42)).toBe("42");
  });

  it("falls back to util.inspect when JSON serialization fails", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const formatted = formatResultData(circular);
    expect(formatted).toContain("[Circular");
  });
});

describe("renderCommandResult", () => {
  const originalExitCode = process.exitCode;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let localeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.exitCode = undefined;
    logSpy = vi.spyOn(console, "log").mockImplementation(noop);
    errorSpy = vi.spyOn(console, "error").mockImplementation(noop);
    localeSpy = vi.spyOn(Date.prototype, "toLocaleTimeString").mockReturnValue("00:00:00");
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    localeSpy.mockRestore();
  });

  afterAll(() => {
    process.exitCode = originalExitCode;
  });

  it("prints success summaries including result payloads and console output", () => {
    renderCommandResult({
      ok: true,
      commandId: "cmd-success",
      durationMs: 25,
      data: { answer: 42 },
      console: [
        {
          id: "log-1",
          timestamp: 0,
          level: "info",
          args: ["ready"],
        },
      ],
    });

    expect(logSpy).toHaveBeenCalledWith("✅ Script executed successfully");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Result"));
    expect(logSpy).toHaveBeenCalledWith("\nConsole output:");
    expect(logSpy).toHaveBeenCalledWith("[00:00:00] info:", "ready");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("reports failures, prints hints, and sets the process exit code", () => {
    renderCommandResult({
      ok: false,
      commandId: "cmd-fail",
      durationMs: 30,
      error: "Session not found or offline",
      stack: "stack trace",
      console: [
        {
          id: "log-2",
          timestamp: 0,
          level: "error",
          args: ["broken"],
        },
      ],
    });

    expect(errorSpy).toHaveBeenCalledWith("❌ Script failed");
    expect(errorSpy).toHaveBeenCalledWith("Error:", "Session not found or offline");
    expect(errorSpy).toHaveBeenCalledWith(
      "Hint: run `pnpm sweetlink sessions` to list active SweetLink sessions and grab a fresh id.",
    );
    expect(errorSpy).toHaveBeenCalledWith("stack trace");
    expect(errorSpy).toHaveBeenCalledWith("\nConsole output before failure:");
    expect(errorSpy).toHaveBeenCalledWith("[00:00:00] error:", "broken");
    expect(process.exitCode).toBe(1);
  });
});

async function createTempHook(contents: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sweetlink-hooks-"));
  const filePath = path.join(dir, "hook.js");
  await writeFile(filePath, contents, "utf8");
  return filePath;
}
