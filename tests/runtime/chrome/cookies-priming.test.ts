import { beforeEach, describe, expect, it, vi } from "vitest";

const noop = () => {
  /* suppress console noise */
};

const resolvePageMock = vi.fn();
const navigatePageMock = vi.fn();
const waitForReadyMock = vi.fn();
const attemptReloadMock = vi.fn();
const delayMock = vi.fn().mockResolvedValue(undefined);

const connectMock = vi.fn();

vi.mock("puppeteer", () => ({
  default: { connect: connectMock },
}));

const collectChromeCookiesMock = vi.fn();
const buildOriginsMock = vi.fn<string[], [string]>();

const buildDeps = () => ({
  collectChromeCookies: collectChromeCookiesMock,
  buildCookieOrigins: buildOriginsMock,
  resolvePuppeteerPage: resolvePageMock,
  navigatePuppeteerPage: navigatePageMock,
  waitForPageReady: waitForReadyMock,
  attemptPuppeteerReload: attemptReloadMock,
  delay: delayMock,
});

const { primeControlledChromeCookies } = await import("../../../../src/runtime/chrome/cookies");

beforeEach(() => {
  collectChromeCookiesMock.mockReset();
  collectChromeCookiesMock.mockResolvedValue([{ name: "auth", value: "1" }]);
  buildOriginsMock.mockReset();
  buildOriginsMock.mockReturnValue(["https://example.dev"]);
  resolvePageMock.mockReset();
  navigatePageMock.mockReset();
  waitForReadyMock.mockReset();
  attemptReloadMock.mockReset();
  delayMock.mockReset();
  delayMock.mockResolvedValue(undefined);
  connectMock.mockReset();
});

const createPage = () => {
  const cookiesMock = vi.fn().mockResolvedValue([{ name: "session", value: "123" }]);
  return {
    url: () => "https://example.dev/app",
    setCookie: vi.fn().mockResolvedValue(undefined),
    cookies: cookiesMock,
  } as unknown as import("puppeteer").Page;
};

describe("primeControlledChromeCookies", () => {
  it("returns early when no cookies are collected", async () => {
    collectChromeCookiesMock.mockResolvedValue([]);

    await primeControlledChromeCookies(
      {
        devtoolsUrl: "http://localhost:9222",
        targetUrl: "https://example.dev/app",
        reload: false,
        context: "new-tab",
      },
      buildDeps(),
    );

    expect(connectMock).not.toHaveBeenCalled();
  });

  it("warns when Puppeteer cannot connect", async () => {
    collectChromeCookiesMock.mockResolvedValue([{ name: "auth", value: "1" }]);
    connectMock.mockRejectedValue(new Error("offline"));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);

    await primeControlledChromeCookies(
      {
        devtoolsUrl: "http://localhost:9222",
        targetUrl: "https://example.dev/app",
        reload: false,
        context: "new-tab",
      },
      buildDeps(),
    );

    expect(warnSpy).toHaveBeenCalledWith(
      "Unable to attach to controlled Chrome for cookie priming:",
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it("applies cookies, verifies sync, and reloads when requested", async () => {
    collectChromeCookiesMock.mockResolvedValue([{ name: "auth", value: "1" }]);
    buildOriginsMock.mockReturnValue(["https://example.dev"]);
    const page = createPage();
    resolvePageMock.mockResolvedValue(page);
    waitForReadyMock.mockResolvedValue(undefined);
    const disconnectMock = vi.fn();
    connectMock.mockResolvedValue({
      pages: vi.fn().mockResolvedValue([page]),
      newPage: vi.fn(),
      disconnect: disconnectMock,
    });

    await primeControlledChromeCookies(
      {
        devtoolsUrl: "http://localhost:9222",
        targetUrl: "https://example.dev/app",
        reload: true,
        context: "existing-tab",
      },
      buildDeps(),
    );

    expect(page.setCookie).toHaveBeenCalledWith({ name: "auth", value: "1" });
    expect(page.cookies).toHaveBeenCalledWith("https://example.dev");
    expect(attemptReloadMock).toHaveBeenCalled();
    expect(disconnectMock).toHaveBeenCalled();
  });
});
