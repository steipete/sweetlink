import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const paths = (() => {
  const tmpRoot = path.join(os.tmpdir(), `sweetlink-devtools-config-${process.pid}`);
  return {
    tmpRoot,
    configPath: path.join(tmpRoot, "devtools.json"),
    statePath: path.join(tmpRoot, "devtools-state.json"),
  };
})();

vi.mock("../../src/runtime/devtools/constants", () => ({
  DEVTOOLS_CONFIG_PATH: paths.configPath,
  DEVTOOLS_STATE_PATH: paths.statePath,
  DEVTOOLS_LISTENER_PID_PATH: path.join(paths.tmpRoot, "listener.pid"),
  DEVTOOLS_CONSOLE_LIMIT: 500,
  DEVTOOLS_NETWORK_LIMIT: 500,
}));

vi.mock("../../src/env", () => ({
  sweetLinkDebug: false,
}));

const devtoolsConfigModule = await import("../../src/runtime/devtools/config");
const {
  loadDevToolsConfig,
  saveDevToolsConfig,
  loadDevToolsState,
  saveDevToolsState,
  deriveDevtoolsLinkInfo,
} = devtoolsConfigModule;

describe("devtools config helpers", () => {
  beforeAll(async () => {
    await mkdir(paths.tmpRoot, { recursive: true });
  });

  afterAll(async () => {
    await rm(paths.tmpRoot, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(paths.configPath, { force: true });
    await rm(paths.statePath, { force: true });
  });

  it("returns null when the config file is missing", async () => {
    const config = await loadDevToolsConfig();
    expect(config).toBeNull();
  });

  it("saves and reloads config values, merging incremental patches", async () => {
    await saveDevToolsConfig({
      devtoolsUrl: "http://localhost:9222",
      port: 9222,
      userDataDir: "/tmp/devtools-profile",
      targetUrl: "https://example.dev",
      sessionId: "session-1",
    });

    await saveDevToolsConfig({
      devtoolsUrl: "http://localhost:9222",
      sessionId: "session-2",
    });

    const raw = JSON.parse(await readFile(paths.configPath, "utf8"));
    expect(raw.sessionId).toBe("session-2");
    expect(raw.port).toBe(9222);
    expect(raw.userDataDir).toBe("/tmp/devtools-profile");

    const loaded = await loadDevToolsConfig();
    expect(loaded?.sessionId).toBe("session-2");
    expect(loaded?.targetUrl).toBe("https://example.dev");
  });

  it("normalizes state documents and persists updates", async () => {
    await saveDevToolsState({
      endpoint: "http://localhost:9222",
      sessionId: "session-1",
      console: [],
      network: [],
      updatedAt: Date.now(),
    });

    const loaded = await loadDevToolsState();
    expect(loaded?.console).toEqual([]);
    expect(loaded?.network).toEqual([]);

    // simulate legacy state without console/network arrays
    await readFile(paths.statePath, "utf8");
    await rm(paths.statePath, { force: true });
    const legacyState = { endpoint: "http://localhost:9222", sessionId: "legacy" };
    await writeFile(paths.statePath, JSON.stringify(legacyState), "utf8");
    const normalized = await loadDevToolsState();
    expect(normalized?.console).toEqual([]);
    expect(normalized?.network).toEqual([]);
  });

  it("derives link info from config and state", () => {
    const result = deriveDevtoolsLinkInfo(
      {
        devtoolsUrl: "http://localhost:9222",
        port: 9222,
        userDataDir: "/tmp/profile",
        sessionId: "cfg-session",
        updatedAt: Date.now(),
      },
      {
        endpoint: "http://localhost:9223",
        sessionId: "state-session",
        console: [],
        network: [],
        updatedAt: Date.now(),
      },
    );

    expect(result.endpoint).toBe("http://localhost:9222");
    expect(result.sessionIds).toEqual(new Set(["cfg-session", "state-session"]));
  });
});
