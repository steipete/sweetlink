import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const existsSyncMock = vi.fn().mockReturnValue(true);
const mkdirSyncMock = vi.fn();

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  mkdirSync: mkdirSyncMock,
}));

const spawnCalls: Array<{ command: string; args: string[] }> = [];
const spawnMock = vi.fn((command: string, args: string[]) => {
  spawnCalls.push({ command, args: [...args] });

  const child = {
    once(event: "error" | "spawn", handler: () => void) {
      if (event === "spawn") {
        queueMicrotask(() => handler());
      }
      return child;
    },
    unref: vi.fn(),
  };

  return child;
});

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

const saveDevToolsConfigMock = vi.fn().mockResolvedValue();
vi.mock("@sweetlink-app/runtime/devtools", () => ({
  saveDevToolsConfig: saveDevToolsConfigMock,
}));

const primeControlledChromeCookiesMock = vi.fn().mockResolvedValue();
vi.mock("@sweetlink-app/runtime/chrome/cookies", () => ({
  primeControlledChromeCookies: primeControlledChromeCookiesMock,
}));

const findAvailablePortMock = vi.fn().mockResolvedValue(9333);
vi.mock("@sweetlink-app/runtime/chrome/reuse", () => ({
  findAvailablePort: findAvailablePortMock,
}));

vi.mock("@sweetlink-app/env", () => ({
  cliEnv: {
    chromePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  },
}));

const launchModule = await import("@sweetlink-app/runtime/chrome/launch");
const { launchChrome, launchControlledChrome, prepareChromeLaunch } = launchModule;

describe("Chrome launch helpers", () => {
  beforeEach(() => {
    existsSyncMock.mockReturnValue(true);
    mkdirSyncMock.mockClear();
    saveDevToolsConfigMock.mockClear();
    primeControlledChromeCookiesMock.mockClear();
    findAvailablePortMock.mockClear();
    spawnMock.mockClear();
    spawnCalls.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("spawns a foreground controlled Chrome window when requested on macOS", async () => {
    const platformSpy = vi.spyOn(process, "platform", "get").mockReturnValue("darwin");

    await launchControlledChrome("https://app.example.dev/timeline", {
      cookieSync: false,
      foreground: true,
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnCalls[0]?.command).toBe(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    );

    platformSpy.mockRestore();
  });

  it("launches controlled Chrome in the background by default on macOS", async () => {
    const platformSpy = vi.spyOn(process, "platform", "get").mockReturnValue("darwin");

    await launchControlledChrome("https://app.example.dev/insights", {
      cookieSync: false,
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnCalls[0]?.command).toBe("open");
    expect(spawnCalls[0]?.args).toEqual(
      expect.arrayContaining(["-g", "-n", "-a", "/Applications/Google Chrome.app"]),
    );

    platformSpy.mockRestore();
  });

  it("passes the correct background flag for regular Chrome launches", async () => {
    const platformSpy = vi.spyOn(process, "platform", "get").mockReturnValue("darwin");

    await launchChrome("https://app.example.dev/timeline", { foreground: true });
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnCalls[0]?.command).toBe(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    );
    expect(spawnCalls[0]?.args).toEqual(
      expect.arrayContaining(["--new-tab", "https://app.example.dev/timeline"]),
    );

    spawnMock.mockClear();
    spawnCalls.length = 0;

    await launchChrome("https://app.example.dev/timeline");
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnCalls[0]?.command).toBe("open");
    expect(spawnCalls[0]?.args).toEqual(
      expect.arrayContaining([
        "-g",
        "-n",
        "-a",
        "/Applications/Google Chrome.app",
        "--args",
        "--new-tab",
      ]),
    );

    platformSpy.mockRestore();
  });

  it("derives macOS open command with background flag when requested", () => {
    const spec = prepareChromeLaunch(
      "darwin",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ["--new-tab", "https://app.example.dev"],
      { background: true },
    );

    expect(spec.command).toBe("open");
    expect(spec.args).toEqual([
      "-g",
      "-n",
      "-a",
      "/Applications/Google Chrome.app",
      "--args",
      "--new-tab",
      "https://app.example.dev",
    ]);
  });
});
