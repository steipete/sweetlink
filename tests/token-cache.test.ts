import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCliToken, resetCliTokenCache } from "../src/token";
import type { CliConfig } from "../src/types";

const ORIGINAL_FETCH = globalThis.fetch;

describe("fetchCliToken caching", () => {
  beforeEach(() => {
    vi.stubEnv("SWEETLINK_SECRET", "test-secret-for-cli");
    vi.resetModules();
    resetCliTokenCache();
  });

  afterEach(() => {
    resetCliTokenCache();
    vi.unstubAllEnvs();
    vi.resetModules();
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it("avoids repeated admin API calls once a secret-backed token is cached", async () => {
    const apiAttempts: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      apiAttempts.push({ input, init });
      return {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({ error: "Authentication required", code: "AUTH_REQUIRED" }),
      } as Response;
    }) as typeof fetch;

    const config: CliConfig = {
      appLabel: "Example App",
      appBaseUrl: "https://app.example.dev",
      daemonBaseUrl: "https://daemon.local",
      adminApiKey: "dummy-admin-key",
      oauthScriptPath: null,
      servers: {},
    };

    const firstToken = await fetchCliToken(config);
    expect(apiAttempts.length).toBe(1);

    apiAttempts.length = 0;
    const secondToken = await fetchCliToken(config);
    expect(apiAttempts.length).toBe(0);
    expect(secondToken).toBe(firstToken);
  });

  it("reuses locally signed tokens when no admin key is supplied", async () => {
    let fetchInvocations = 0;
    globalThis.fetch = (() => {
      fetchInvocations += 1;
      throw new Error("fetch should not be invoked when adminApiKey is missing");
    }) as typeof fetch;

    const config: CliConfig = {
      appLabel: "Example App",
      appBaseUrl: "https://app.example.dev",
      daemonBaseUrl: "https://daemon.local",
      adminApiKey: null,
      oauthScriptPath: null,
      servers: {},
    };

    const firstToken = await fetchCliToken(config);
    expect(firstToken.length).toBeGreaterThan(0);
    expect(fetchInvocations).toBe(0);

    const secondToken = await fetchCliToken(config);
    expect(fetchInvocations).toBe(0);
    expect(secondToken).toBe(firstToken);
  });
});
