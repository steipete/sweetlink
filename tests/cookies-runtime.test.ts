import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/core/config-file", async () => {
  const actual =
    await vi.importActual<typeof import("../src/core/config-file")>("../src/core/config-file");
  return {
    ...actual,
    loadSweetLinkFileConfig: vi.fn(),
  };
});

const { loadSweetLinkFileConfig } = await import("../src/core/config-file");
const mockedLoadConfig = vi.mocked(loadSweetLinkFileConfig);
const { buildCookieOrigins, normalizePuppeteerCookie } = await import("../src/runtime/cookies");

const EMPTY_CONFIG = { path: null, config: {} } as const;

describe("runtime/cookies utilities", () => {
  beforeEach(() => {
    mockedLoadConfig.mockReset();
    mockedLoadConfig.mockReturnValue(EMPTY_CONFIG);
  });

  it("builds cookie origins with configured fallbacks for local and remote targets", () => {
    mockedLoadConfig.mockReturnValue({
      path: "/mock/config.json",
      config: {
        cookieMappings: [
          {
            hosts: ["localhost", "example.dev", "*.example.dev"],
            origins: ["https://auth.example.dev", "https://api.example.dev"],
          },
        ],
      },
    });

    const localOrigins = buildCookieOrigins("http://localhost:4100/dashboard");
    expect(localOrigins).toEqual(
      expect.arrayContaining([
        "http://localhost:4100",
        "https://auth.example.dev",
        "https://api.example.dev",
      ]),
    );

    const remoteOrigins = buildCookieOrigins("https://app.example.dev/dashboard");
    expect(remoteOrigins).toEqual(
      expect.arrayContaining([
        "https://app.example.dev",
        "https://auth.example.dev",
        "https://api.example.dev",
      ]),
    );
  });

  it("normalizes puppeteer cookies and rehomes configured auth tokens for local targets", () => {
    mockedLoadConfig.mockReturnValue({
      path: "/mock/config.json",
      config: {
        cookieMappings: [
          {
            hosts: ["example.dev", "*.example.dev"],
            origins: ["https://auth.example.dev"],
          },
        ],
      },
    });

    const targetBase = new URL("http://localhost:4100/dashboard");
    const sourceBase = new URL("https://auth.example.dev/");
    const cookie = normalizePuppeteerCookie(
      {
        name: "__Secure-better-auth.session-token",
        value: "abcd",
        domain: ".example.dev",
        path: "/",
        sameSite: "None",
        secure: true,
      },
      { sourceBase, targetBase },
    );

    expect(cookie).toEqual(
      expect.objectContaining({
        name: "better-auth.session-token",
        url: "http://localhost:4100",
        path: "/",
        sameSite: "Lax",
        secure: false,
      }),
    );
  });

  it("respects explicit secure and SameSite flags for non-local targets", () => {
    const targetBase = new URL("https://app.example.dev/dashboard");
    const sourceBase = new URL("https://app.example.dev/");
    const cookie = normalizePuppeteerCookie(
      {
        name: "session-id",
        value: "abc",
        domain: ".auth.example.dev",
        path: "/auth",
        secure: true,
        sameSite: "Lax",
      },
      { sourceBase, targetBase },
    );

    expect(cookie).toEqual(
      expect.objectContaining({
        name: "session-id",
        domain: ".auth.example.dev",
        path: "/auth",
        secure: true,
        sameSite: "Lax",
      }),
    );
  });
});
