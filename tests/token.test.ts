import { regex } from "arkregex";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CliConfig } from "../src/types";

const noop = () => {
  /* suppress console noise */
};
const CLI_TOKEN_FAILURE_PATTERN = regex.as("Unable to resolve SweetLink CLI token");

const fetchJsonMock = vi.fn();
const resolveSecretMock = vi.fn();
const signTokenMock = vi.fn();

vi.mock("../src/http", () => ({
  fetchJson: fetchJsonMock,
}));

vi.mock("../shared/src/node", async () => {
  const actual = await vi.importActual<object>("../shared/src/node");
  return {
    ...actual,
    resolveSweetLinkSecret: resolveSecretMock,
  };
});

vi.mock("../shared/src", async () => {
  const actual = await vi.importActual<object>("../shared/src");
  return {
    ...actual,
    SWEETLINK_CLI_EXP_SECONDS: 3600,
    signSweetLinkToken: signTokenMock,
  };
});

const { fetchCliToken, resetCliTokenCache } = await import("../../src/token");

const baseConfig: CliConfig = {
  appLabel: "Sweetistics",
  appBaseUrl: "https://app.example.dev",
  daemonBaseUrl: "https://daemon.example.dev",
  adminApiKey: null,
  oauthScriptPath: null,
  servers: {},
};

beforeEach(() => {
  resetCliTokenCache();
  fetchJsonMock.mockReset();
  resolveSecretMock.mockReset();
  signTokenMock.mockReset();
  vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
});

describe("fetchCliToken", () => {
  it("returns cached tokens when they are still valid", async () => {
    resolveSecretMock.mockResolvedValue({ secret: "local-secret", source: "generated" });
    signTokenMock.mockReturnValue("signed-token");

    const first = await fetchCliToken(baseConfig);
    const second = await fetchCliToken(baseConfig);

    expect(first).toBe("signed-token");
    expect(second).toBe("signed-token");
    expect(resolveSecretMock).toHaveBeenCalledTimes(1);
  });

  it("prefers admin API tokens when the request succeeds", async () => {
    fetchJsonMock.mockResolvedValueOnce({ accessToken: "api-token", expiresAt: 1_700_000_100 });

    const token = await fetchCliToken({ ...baseConfig, adminApiKey: "admin-key" });

    expect(token).toBe("api-token");
    expect(fetchJsonMock).toHaveBeenCalledWith(
      "https://app.example.dev/api/admin/sweetlink/cli-token",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer admin-key" }),
      }),
    );
  });

  it("falls back to local secrets when the admin API call fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);
    fetchJsonMock.mockRejectedValueOnce(new Error("network down"));
    resolveSecretMock.mockResolvedValue({ secret: "local-secret", source: "file" });
    signTokenMock.mockReturnValue("fallback-token");

    const token = await fetchCliToken({ ...baseConfig, adminApiKey: "admin-key" });

    expect(token).toBe("fallback-token");
    expect(warnSpy).toHaveBeenCalledWith(
      "[SweetLink CLI] Falling back to local secret after CLI token request failed:",
      "network down",
    );
    warnSpy.mockRestore();
  });

  it("throws descriptive errors when the local secret cannot be resolved", async () => {
    const failure = new Error("permission denied");
    resolveSecretMock.mockRejectedValue(failure);

    await expect(fetchCliToken(baseConfig)).rejects.toThrow(CLI_TOKEN_FAILURE_PATTERN);
  });
});
