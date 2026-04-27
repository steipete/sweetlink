import type { SpyInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CliConfig } from "../src/types";

describe("resolveSessionIdFromHint", () => {
  let resolveSessionIdFromHint: (typeof import("../src/index"))["resolveSessionIdFromHint"];
  let fetchJsonSpy: SpyInstance;
  let fetchCliTokenSpy: SpyInstance;
  let config: CliConfig;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("SWEETLINK_CLI_TEST", "1");

    const tokenModule = await import("../src/token");
    fetchCliTokenSpy = vi.spyOn(tokenModule, "fetchCliToken").mockResolvedValue("test-token");

    const httpModule = await import("../src/http");
    fetchJsonSpy = vi.spyOn(httpModule, "fetchJson");

    ({ resolveSessionIdFromHint } = await import("../src/index"));

    config = {
      appLabel: "Example App",
      appBaseUrl: "https://app.example.dev",
      daemonBaseUrl: "https://daemon.local",
      adminApiKey: "dummy-admin-key",
      oauthScriptPath: null,
      servers: {},
    };
  });

  afterEach(() => {
    fetchJsonSpy.mockRestore();
    fetchCliTokenSpy.mockRestore();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns the provided session id when it already matches UUID format", async () => {
    const sessionId = "6b41c868-229a-4c44-ac3d-fcbcf21ac6a4";
    const result = await resolveSessionIdFromHint(sessionId, config);
    expect(result).toBe(sessionId);
    expect(fetchCliTokenSpy).not.toHaveBeenCalled();
    expect(fetchJsonSpy).not.toHaveBeenCalled();
  });

  it("resolves friendly codenames to the underlying session id", async () => {
    const now = Date.now();
    fetchJsonSpy.mockResolvedValue({
      sessions: [
        {
          sessionId: "6b41c868-229a-4c44-ac3d-fcbcf21ac6a4",
          codename: "mango-honey",
          url: "https://app.example.dev/timeline",
          title: "Timeline",
          topOrigin: "https://app.example.dev",
          createdAt: now - 1000,
          lastSeenAt: now,
          heartbeatMsAgo: 500,
          consoleEventsBuffered: 0,
          consoleErrorsBuffered: 0,
          pendingCommandCount: 0,
          socketState: "open",
        },
      ],
    });

    const result = await resolveSessionIdFromHint("mango-honey", config);

    expect(result).toBe("6b41c868-229a-4c44-ac3d-fcbcf21ac6a4");
    expect(fetchCliTokenSpy).toHaveBeenCalledOnce();
    expect(fetchJsonSpy).toHaveBeenCalledWith(`${config.daemonBaseUrl}/sessions`, {
      headers: { Authorization: "Bearer test-token" },
    });
  });

  it("throws a helpful error when the codename does not match an active session", async () => {
    fetchJsonSpy.mockResolvedValue({ sessions: [] });

    await expect(resolveSessionIdFromHint("unknown-friend", config)).rejects.toThrow(
      'No active SweetLink session matches "unknown-friend"',
    );
  });
});
