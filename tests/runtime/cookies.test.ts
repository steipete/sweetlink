import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/core/config-file", async () => {
  const actual = await vi.importActual<typeof import("../../src/core/config-file")>(
    "../../src/core/config-file",
  );
  return {
    ...actual,
    loadSweetLinkFileConfig: vi.fn(),
  };
});

const { loadSweetLinkFileConfig } = await import("../../src/core/config-file");
const mockedLoadConfig = vi.mocked(loadSweetLinkFileConfig);
const { buildCookieOrigins, normalizePuppeteerCookie } = await import("../../src/runtime/cookies");

const MOCK_EMPTY = { path: null, config: {} };

describe("buildCookieOrigins", () => {
  beforeEach(() => {
    mockedLoadConfig.mockReset();
    mockedLoadConfig.mockReturnValue(MOCK_EMPTY);
  });

  it("returns only the target origin when no mappings are configured", () => {
    expect(buildCookieOrigins("https://demo.example.com/path")).toEqual([
      "https://demo.example.com",
    ]);
  });

  it("includes configured origins when host matches exactly", () => {
    mockedLoadConfig.mockReturnValue({
      path: "/mock/config.json",
      config: {
        cookieMappings: [
          {
            hosts: ["example.dev"],
            origins: ["https://auth.example.dev", "https://api.example.dev"],
          },
        ],
      },
    });

    expect(buildCookieOrigins("https://example.dev/dashboard")).toEqual([
      "https://example.dev",
      "https://auth.example.dev",
      "https://api.example.dev",
    ]);
  });

  it("matches subdomains and lower-cases hosts", () => {
    mockedLoadConfig.mockReturnValue({
      path: "/mock/config.json",
      config: {
        cookieMappings: [
          {
            hosts: ["Example.dev"],
            origins: ["https://login.example.test"],
          },
        ],
      },
    });

    expect(buildCookieOrigins("https://app.example.dev/dashboard")).toEqual([
      "https://app.example.dev",
      "https://login.example.test",
    ]);
  });
});

describe("normalizePuppeteerCookie", () => {
  beforeEach(() => {
    mockedLoadConfig.mockReset();
    mockedLoadConfig.mockReturnValue(MOCK_EMPTY);
  });

  it("rehomes configured domains to localhost targets and strips secure prefixes", () => {
    mockedLoadConfig.mockReturnValue({
      path: "/mock/config.json",
      config: {
        cookieMappings: [
          {
            hosts: ["example.dev"],
            origins: ["https://auth.example.dev"],
          },
        ],
      },
    });

    const result = normalizePuppeteerCookie(
      {
        name: "__Host-session",
        value: "abc",
        domain: ".example.dev",
        path: "/custom",
        sameSite: "none",
        httpOnly: true,
      },
      {
        sourceBase: new URL("https://example.dev"),
        targetBase: new URL("http://localhost:4455/dashboard"),
      },
    );

    expect(result).toEqual({
      name: "session",
      value: "abc",
      url: "http://localhost:4455",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    });
  });

  it("preserves remote cookie attributes when the target domain is not local", () => {
    const result = normalizePuppeteerCookie(
      {
        name: "session",
        value: "token",
        domain: ".example.dev",
        path: "/auth",
        Secure: true,
        HttpOnly: true,
        sameSite: "lax",
        expires: 1_700_000_000,
      },
      {
        sourceBase: new URL("https://example.dev"),
        targetBase: new URL("https://app.example.dev"),
      },
    );

    expect(result).toEqual({
      name: "session",
      value: "token",
      domain: ".example.dev",
      path: "/auth",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
      expires: 1_700_000_000,
    });
  });
});
