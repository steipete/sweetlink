import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

// NOTE: unlike click-command.test.ts, this suite intentionally does NOT mock
// `../../src/core/env`, so the real `readCommandOptions` (optsWithGlobals) runs
// against the actual Commander-parsed options. That is what exercises the
// `--no-scroll` / `--no-bubbles` defaults end to end.

const resolveConfigMock = vi.fn();
const resolveSessionIdMock = vi.fn();
const buildClickScriptMock = vi.fn();
const executeRunScriptMock = vi.fn();
const fetchConsoleEventsMock = vi.fn();
const resolvePromptOptionMock = vi.fn();
const renderCommandResultMock = vi.fn();
const analyzeConsoleWithCodexMock = vi.fn();
const delayMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../../src/core/config", () => ({
  resolveConfig: resolveConfigMock,
}));

vi.mock("../../src/runtime/session", () => ({
  buildClickScript: buildClickScriptMock,
  executeRunScriptCommand: executeRunScriptMock,
  fetchConsoleEvents: fetchConsoleEventsMock,
  resolveSessionIdFromHint: resolveSessionIdMock,
  resolvePromptOption: resolvePromptOptionMock,
}));

vi.mock("../../src/runtime/scripts", () => ({
  renderCommandResult: renderCommandResultMock,
}));

vi.mock("../../src/codex", () => ({
  analyzeConsoleWithCodex: analyzeConsoleWithCodexMock,
}));

vi.mock("../../src/util/time", () => ({
  delay: delayMock,
}));

const { registerClickCommand } = await import("../../src/commands/click");

async function runClick(
  extraArgs: string[],
): Promise<{ scrollIntoView: boolean; bubbles: boolean }> {
  const program = new Command();
  program.exitOverride();
  registerClickCommand(program);
  await program.parseAsync(["click", "hint", "--selector", "#a", ...extraArgs], { from: "user" });
  const call = buildClickScriptMock.mock.calls.at(-1)?.[0];
  return { scrollIntoView: call.scrollIntoView, bubbles: call.bubbles };
}

describe("sweetlink click – scroll/bubble option defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveConfigMock.mockReturnValue({
      appBaseUrl: "https://x.dev",
      daemonBaseUrl: "https://d.dev",
    });
    resolveSessionIdMock.mockResolvedValue("session-1");
    resolvePromptOptionMock.mockReturnValue(undefined);
    fetchConsoleEventsMock.mockResolvedValue([]);
    buildClickScriptMock.mockReturnValue("/* click */");
    executeRunScriptMock.mockResolvedValue({ ok: true });
    analyzeConsoleWithCodexMock.mockResolvedValue(false);
  });

  it("scrolls into view and bubbles by default (no flags)", async () => {
    expect(await runClick([])).toEqual({ scrollIntoView: true, bubbles: true });
  });

  it("--no-scroll disables only scrolling", async () => {
    expect(await runClick(["--no-scroll"])).toEqual({ scrollIntoView: false, bubbles: true });
  });

  it("--no-bubbles disables only bubbling", async () => {
    expect(await runClick(["--no-bubbles"])).toEqual({ scrollIntoView: true, bubbles: false });
  });
});
