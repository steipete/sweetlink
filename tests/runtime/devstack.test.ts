import { beforeEach, describe, expect, it, vi } from "vitest";

const noop = () => {
  /* mute console output in tests */
};

const existsSyncMock = vi.fn();
const readFileSyncMock = vi.fn();

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
}));

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

const setGlobalDispatcherMock = vi.fn();
const AgentMock = vi.fn();
vi.mock("undici", () => ({
  Agent: AgentMock,
  setGlobalDispatcher: setGlobalDispatcherMock,
}));

const cliEnvMock = {
  caPath: "/tmp/custom-ca.pem",
  caRoot: "/tmp/mkcert",
};

vi.mock("../../src/env", () => ({
  cliEnv: cliEnvMock,
  sweetLinkDebug: true,
}));

const delayMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../../src/util/time", () => ({
  delay: delayMock,
}));

const fetchMock = vi.fn();
// @ts-expect-error – mutating global fetch for tests
global.fetch = fetchMock;

const { maybeInstallMkcertDispatcher, isAppReachable, ensureDevStackRunning } =
  await import("../../src/runtime/devstack");

beforeEach(() => {
  vi.restoreAllMocks();
  existsSyncMock.mockReset();
  readFileSyncMock.mockReset();
  spawnMock.mockReset();
  AgentMock.mockReset();
  setGlobalDispatcherMock.mockReset();
  delayMock.mockReset();
  fetchMock.mockReset();
  cliEnvMock.caPath = "/tmp/custom-ca.pem";
  cliEnvMock.caRoot = "/tmp/mkcert";
});

describe("maybeInstallMkcertDispatcher", () => {
  it("installs the first readable certificate it finds", () => {
    existsSyncMock.mockReturnValue(true);
    const caBuffer = Buffer.from("TLS DATA");
    readFileSyncMock.mockReturnValue(caBuffer);

    maybeInstallMkcertDispatcher();

    expect(AgentMock).toHaveBeenCalledWith({ connect: { ca: caBuffer } });
    expect(setGlobalDispatcherMock).toHaveBeenCalledTimes(1);
  });

  it("warns when certificate loading fails and falls back gracefully", () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockImplementation(() => {
      throw new Error("boom");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);

    maybeInstallMkcertDispatcher();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to register SweetLink TLS CA"),
      expect.any(Error),
    );
    expect(setGlobalDispatcherMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("isAppReachable", () => {
  it("returns true when a HEAD request succeeds", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });

    await expect(isAppReachable("https://app.example.dev", ["/status"])).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.example.dev",
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  it("returns false when requests fail with non-network errors", async () => {
    fetchMock.mockRejectedValue(new Error("TLS handshake failed"));

    await expect(isAppReachable("https://app.example.dev")).resolves.toBe(false);
  });
});

describe("ensureDevStackRunning", () => {
  it("attempts to start the dev stack and waits until it becomes healthy", async () => {
    fetchMock
      .mockRejectedValueOnce(Object.assign(new Error("ECONNREFUSED 127.0.0.1"), { name: "Error" }))
      .mockResolvedValueOnce({ ok: true });
    const childProcess = { unref: vi.fn() };
    spawnMock.mockReturnValue(childProcess);
    delayMock.mockResolvedValue(undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(noop);

    await ensureDevStackRunning(new URL("https://app.example.dev/timeline"), {
      repoRoot: "/repo",
      server: {
        start: ["npm", "run", "dev"],
        timeoutMs: 1500,
      },
    });

    expect(spawnMock).toHaveBeenCalledWith(
      "npm",
      ["run", "dev"],
      expect.objectContaining({ cwd: "/repo", detached: true }),
    );
    expect(childProcess.unref).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalledWith("Dev stack is online.");
    logSpy.mockRestore();
  });

  it("warns when the dev stack is offline and no start command is configured", async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error("ECONNREFUSED"), { name: "Error" }));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);

    await ensureDevStackRunning(new URL("https://app.example.dev"), { repoRoot: "/repo" });

    expect(spawnMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "Dev stack appears offline and no start command is configured. Start it manually.",
    );
    warnSpy.mockRestore();
  });

  it("treats successful check commands as healthy without hitting fetch", async () => {
    fetchMock.mockReset();
    const child = {
      once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (event === "close") {
          handler(0);
        }
        return child;
      }),
      kill: vi.fn(),
    };
    spawnMock.mockReturnValue(child);

    await ensureDevStackRunning(new URL("https://app.example.dev"), {
      repoRoot: "/repo",
      server: { check: ["echo", "ok"] },
    });

    expect(spawnMock).toHaveBeenCalledWith(
      "echo",
      ["ok"],
      expect.objectContaining({ cwd: "/repo" }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
