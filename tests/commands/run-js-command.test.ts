import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveConfigMock = vi.fn();
const readOptionsMock = vi.fn();
const resolveScriptMock = vi.fn();
const resolveSessionIdMock = vi.fn();
const executeCommandMock = vi.fn();
const renderResultMock = vi.fn();

vi.mock("../../src/core/config", () => ({
  resolveConfig: resolveConfigMock,
}));

vi.mock("../../src/core/env", () => ({
  readCommandOptions: readOptionsMock,
}));

vi.mock("../../src/runtime/scripts", () => ({
  resolveScript: resolveScriptMock,
  renderCommandResult: renderResultMock,
}));

vi.mock("../../src/runtime/session", () => ({
  resolveSessionIdFromHint: resolveSessionIdMock,
  executeRunScriptCommand: executeCommandMock,
}));

const { registerRunJsCommand } = await import("../../src/commands/run-js");

const config = {
  appLabel: "Test",
  adminApiKey: null,
  appBaseUrl: "https://example.dev",
  daemonBaseUrl: "https://daemon.dev",
  oauthScriptPath: null,
  servers: {},
};

beforeEach(() => {
  resolveConfigMock.mockReset();
  readOptionsMock.mockReset();
  resolveScriptMock.mockReset();
  resolveSessionIdMock.mockReset();
  executeCommandMock.mockReset();
  renderResultMock.mockReset();
});

describe("registerRunJsCommand", () => {
  it("executes inline scripts with resolved options", async () => {
    const program = new Command();
    registerRunJsCommand(program);

    readOptionsMock.mockReturnValue({ timeout: 123, captureConsole: true });
    resolveConfigMock.mockReturnValue(config);
    resolveScriptMock.mockResolvedValue("console.log(42)");
    resolveSessionIdMock.mockResolvedValue("session-abc");
    executeCommandMock.mockResolvedValue({ ok: true });

    await program.parseAsync(["run-js", "hint", "console.log(1);"], { from: "user" });

    expect(resolveScriptMock).toHaveBeenCalledWith({ timeout: 123, captureConsole: true }, [
      "console.log(1);",
    ]);
    expect(resolveSessionIdMock).toHaveBeenCalledWith("hint", config);
    expect(executeCommandMock).toHaveBeenCalledWith(config, {
      sessionId: "session-abc",
      code: "console.log(42)",
      timeoutMs: 123,
      captureConsole: true,
    });
    expect(renderResultMock).toHaveBeenCalledWith({ ok: true });
  });
});
