import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

const noop = () => {
  /* suppress console noise */
};

const readCommandOptionsMock = vi.fn();
const resolveConfigMock = vi.fn();
const resolveSessionIdMock = vi.fn();
const buildClickScriptMock = vi.fn();
const executeRunScriptMock = vi.fn();
const fetchConsoleEventsMock = vi.fn();
const resolvePromptOptionMock = vi.fn();
const renderCommandResultMock = vi.fn();
const analyzeConsoleWithCodexMock = vi.fn();
const delayMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../../src/core/env", () => ({
  readCommandOptions: readCommandOptionsMock,
}));

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

const mockConfig = {
  appLabel: "Test App",
  adminApiKey: null,
  appBaseUrl: "https://example.dev",
  daemonBaseUrl: "https://daemon.dev",
  oauthScriptPath: null,
  servers: {},
};

describe("registerClickCommand", () => {
  it("executes the click workflow and reports console events", async () => {
    const program = new Command();
    registerClickCommand(program);

    readCommandOptionsMock.mockReturnValue({ selector: "#login", timeout: 2000 });
    resolveConfigMock.mockReturnValue(mockConfig);
    resolveSessionIdMock.mockResolvedValue("session-1");
    buildClickScriptMock.mockReturnValue('console.log("click")');
    executeRunScriptMock.mockResolvedValue({ ok: true } as const);
    fetchConsoleEventsMock
      .mockResolvedValueOnce([{ id: "a" }])
      .mockResolvedValueOnce([
        { id: "a" },
        { id: "b", level: "error", args: ["boom"], timestamp: 0 },
      ]);
    resolvePromptOptionMock.mockReturnValue(undefined);
    analyzeConsoleWithCodexMock.mockResolvedValue(false);

    const logSpy = vi.spyOn(console, "log").mockImplementation(noop);

    await program.parseAsync(["click", "hint", "--selector", "#login"], { from: "user" });

    expect(resolveSessionIdMock).toHaveBeenCalledWith("hint", mockConfig);
    expect(buildClickScriptMock).toHaveBeenCalledWith({
      selector: "#login",
      scrollIntoView: true,
      bubbles: true,
    });
    expect(executeRunScriptMock).toHaveBeenCalledWith(
      mockConfig,
      expect.objectContaining({ sessionId: "session-1" }),
    );
    expect(renderCommandResultMock).toHaveBeenCalledWith({ ok: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Console after click"));

    logSpy.mockRestore();
  });

  it("sends console output to Codex when a prompt is provided", async () => {
    const program = new Command();
    registerClickCommand(program);

    readCommandOptionsMock.mockReturnValue({ selector: "#submit", prompt: "Explain errors" });
    resolveConfigMock.mockReturnValue(mockConfig);
    resolveSessionIdMock.mockResolvedValue("session-2");
    buildClickScriptMock.mockReturnValue("document.body.click()");
    executeRunScriptMock.mockResolvedValue({ ok: true } as const);
    fetchConsoleEventsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "evt", level: "info", args: ["ok"], timestamp: 0 }]);
    resolvePromptOptionMock.mockReturnValue("Explain errors");
    analyzeConsoleWithCodexMock.mockResolvedValue(true);

    const logSpy = vi.spyOn(console, "log").mockImplementation(noop);

    await program.parseAsync(
      ["click", "session-2", "--selector", "#submit", "--prompt", "Explain errors"],
      {
        from: "user",
      },
    );

    expect(analyzeConsoleWithCodexMock).toHaveBeenCalledWith(
      "#submit",
      "Explain errors",
      expect.any(Array),
      {
        silent: true,
        appLabel: "Test App",
      },
    );
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Console after click"));

    logSpy.mockRestore();
  });
});
