import { Command } from "commander";
import { regex } from "arkregex";
import { describe, expect, it, vi } from "vitest";

const OAUTH_HANDLER_PATTERN = regex.as(String.raw`handlers\/oauth\.ts$`);
const FILE_OAUTH_PATTERN = regex.as(String.raw`file-oauth\.ts$`);

const readOptionsMock = vi.fn();
const loadFileConfigMock = vi.fn();

vi.mock("../../src/core/env", () => ({
  readCommandOptions: readOptionsMock,
}));

vi.mock("../../src/core/config-file", () => ({
  loadSweetLinkFileConfig: loadFileConfigMock,
}));

const sweetLinkEnvMock = {
  appUrl: "https://env.app.dev",
  daemonUrl: "https://env.daemon.dev",
  adminApiKey: "env-admin",
  localAdminApiKey: "env-local",
  appLabel: "Env App",
  cliOauthScriptPath: "./scripts/oauth.ts",
};

vi.mock("../../src/env", () => ({
  sweetLinkEnv: sweetLinkEnvMock,
}));

const { readRootProgramOptions, resolveConfig } = await import("../../src/core/config");

describe("readRootProgramOptions", () => {
  it("prefers CLI overrides for URLs, labels, and oauth scripts", () => {
    readOptionsMock.mockReturnValue({
      appUrl: "https://cli.app.dev",
      daemonUrl: "https://cli.daemon.dev",
      adminKey: "cli-admin",
      appLabel: " CLI Label ",
      port: "4100",
      oauthScript: "./handlers/oauth.ts",
    });
    loadFileConfigMock.mockReturnValue({
      config: {
        appUrl: "https://file.app.dev",
        daemonUrl: "https://file.daemon.dev",
        adminKey: "file-admin",
        servers: [
          {
            env: "dev",
            start: ["pnpm", "dev"],
            check: ["curl", "http://localhost:3000"],
            cwd: "/repo",
            timeoutMs: 1000,
          },
        ],
      },
    });

    const options = readRootProgramOptions(new Command());

    expect(options.appUrl).toBe("https://cli.app.dev");
    expect(options.daemonUrl).toBe("https://cli.daemon.dev");
    expect(options.adminKey).toBe("cli-admin");
    expect(options.oauthScriptPath).toMatch(OAUTH_HANDLER_PATTERN);
    expect(options.appLabel).toBe("CLI Label");
    expect(options.servers).toHaveLength(1);
  });

  it("falls back to config + env defaults when CLI input is missing", () => {
    readOptionsMock.mockReturnValue({ port: 5173 });
    loadFileConfigMock.mockReturnValue({
      config: {
        appUrl: "https://file.app.dev",
        daemonUrl: "https://file.daemon.dev",
        adminKey: null,
        port: 9000,
        oauthScript: "./file-oauth.ts",
        servers: [],
      },
    });

    const options = readRootProgramOptions(new Command());

    expect(options.appUrl).toBe("https://file.app.dev:5173/");
    expect(options.daemonUrl).toBe("https://file.daemon.dev");
    expect(options.oauthScriptPath).toMatch(FILE_OAUTH_PATTERN);
    expect(options.adminKey).toBe("env-local");
  });
});

describe("resolveConfig", () => {
  it("maps server entries by environment", () => {
    readOptionsMock.mockReturnValue({});
    loadFileConfigMock.mockReturnValue({
      config: {
        appUrl: "https://file.app.dev",
        daemonUrl: "https://file.daemon.dev",
        adminKey: "file-admin",
        appLabel: "File Label",
        servers: [
          { env: "dev", start: ["pnpm", "dev"], check: null, cwd: null, timeoutMs: 1000 },
          { env: "prod", start: null, check: null, cwd: null, timeoutMs: null },
        ],
      },
    });

    const command = new Command();
    const config = resolveConfig(command);

    expect(config.appBaseUrl).toBe("https://file.app.dev");
    expect(config.daemonBaseUrl).toBe("https://file.daemon.dev");
    expect(config.servers.dev).toMatchObject({ env: "dev", timeoutMs: 1000 });
    expect(config.servers.prod).toMatchObject({ env: "prod" });
  });
});
