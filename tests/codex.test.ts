import type { ChildProcess } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());

const noop = () => {
  /* silence console during tests */
};

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

const codexModule = await import("../src/codex");
const { runCodexImagePrompt, runCodexTextPrompt, analyzeConsoleWithCodex } = codexModule;

type Listener = (...arguments_: unknown[]) => void;

function createChild(): ChildProcess & {
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
} {
  const listeners = new Map<string, Set<Listener>>();
  const addListener = (event: string, listener: Listener) => {
    const bucket = listeners.get(event);
    if (bucket) {
      bucket.add(listener);
    } else {
      listeners.set(event, new Set([listener]));
    }
  };

  const child = {
    stdin: {
      write: vi.fn(),
      end: vi.fn(),
    },
    on(event: string, listener: Listener) {
      addListener(event, listener);
      return this;
    },
    once(event: string, listener: Listener) {
      const wrapper: Listener = (...args) => {
        this.off(event, wrapper);
        listener(...args);
      };
      return this.on(event, wrapper);
    },
    off(event: string, listener: Listener) {
      listeners.get(event)?.delete(listener);
      return this;
    },
    emit(event: string, ...args: unknown[]) {
      const subscribers = listeners.get(event);
      if (subscribers) {
        for (const listener of subscribers) {
          listener(...args);
        }
      }
      return true;
    },
    removeAllListeners(event?: string) {
      if (typeof event === "string") {
        listeners.delete(event);
      } else {
        listeners.clear();
      }
      return this;
    },
  } as ChildProcess & {
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    emit: (event: string, ...args: unknown[]) => boolean;
  };

  return child;
}

describe("codex helpers", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("sends screenshots to the Codex CLI with stdin payloads", async () => {
    const child = createChild();
    spawnMock.mockReturnValue(child);
    const promise = runCodexImagePrompt("/tmp/screenshot.jpg", "Explain the chart");
    setImmediate(() => child.emit("close", 0));

    const exitCode = await promise;
    expect(exitCode).toBe(0);
    expect(spawnMock).toHaveBeenCalledWith(
      "codex",
      expect.arrayContaining(["-i", "/tmp/screenshot.jpg", "-"]),
      {
        stdio: ["pipe", "inherit", "inherit"],
      },
    );
    expect(child.stdin.write).toHaveBeenCalledWith("Explain the chart\n");
    expect(child.stdin.end).toHaveBeenCalled();
  });

  it("sends plain-text prompts without stdin piping", async () => {
    const child = createChild();
    spawnMock.mockReturnValue(child);
    const promise = runCodexTextPrompt("Summarize this log");
    setImmediate(() => child.emit("close", 0));

    await expect(promise).resolves.toBe(0);
    expect(spawnMock).toHaveBeenCalledWith(
      "codex",
      expect.arrayContaining(["Summarize this log"]),
      {
        stdio: ["inherit", "inherit", "inherit"],
      },
    );
    expect(child.stdin.write).not.toHaveBeenCalled();
  });

  it("returns true when console analysis completes successfully", async () => {
    const child = createChild();
    spawnMock.mockReturnValue(child);
    const logSpy = vi.spyOn(console, "log").mockImplementation(noop);
    const resultPromise = analyzeConsoleWithCodex(
      "#cta",
      "Any errors?",
      [
        { id: "1", timestamp: 0, level: "error", args: ["boom"] },
        { id: "2", timestamp: 1, level: "warn", args: [] },
      ],
      { appLabel: "Ops Console" },
    );
    setImmediate(() => child.emit("close", 0));

    const result = await resultPromise;
    expect(result).toBe(true);
    expect(spawnMock).toHaveBeenCalledWith("codex", expect.any(Array), expect.any(Object));
    const args = spawnMock.mock.calls[0][1] as string[];
    const promptArg = args.at(-1) ?? "";
    expect(promptArg).toContain("#cta");
    expect(promptArg).toContain("Ops Console");
    logSpy.mockRestore();
  });

  it("returns false and warns when Codex exits with an error code", async () => {
    const child = createChild();
    spawnMock.mockReturnValue(child);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);
    const resultPromise = analyzeConsoleWithCodex("#cta", "Why?", [], {});
    setImmediate(() => child.emit("close", 2));

    const result = await resultPromise;
    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith("Codex exited with status 2.");
    warnSpy.mockRestore();
  });

  it("warns with a helpful hint when the CLI is missing", async () => {
    const child = createChild();
    spawnMock.mockReturnValue(child);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);
    const resultPromise = analyzeConsoleWithCodex("#cta", "Need CLI?", []);
    setImmediate(() => {
      const error = new Error("not found");
      (error as NodeJS.ErrnoException).code = "ENOENT";
      child.emit("error", error);
    });

    const result = await resultPromise;
    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Codex CLI not found"));
    warnSpy.mockRestore();
  });
});
