import { describe, expect, it, vi } from "vitest";
import oauthAutomation from "../../examples/oauth/twitter-oauth-automation";
import type { SweetLinkOauthAuthorizeContext } from "../../src/runtime/devtools/types";

const createContext = (
  overrides: Partial<SweetLinkOauthAuthorizeContext> = {},
): SweetLinkOauthAuthorizeContext => ({
  devtoolsUrl: "http://127.0.0.1:9222",
  sessionUrl: "http://localhost:3000/login",
  fetchTabs: vi.fn().mockResolvedValue([]),
  evaluateInDevToolsTab: vi.fn().mockResolvedValue(null),
  urlsRoughlyMatch: () => false,
  connectPuppeteer: vi.fn().mockResolvedValue(null),
  resolvePuppeteerPage: vi.fn(),
  navigatePuppeteerPage: vi.fn(),
  waitForPageReady: vi.fn(),
  delay: vi.fn().mockResolvedValue(undefined),
  logDebugError: vi.fn(),
  ...overrides,
});

describe("twitter oauth automation", () => {
  it("returns handled when the authorize button is found immediately", async () => {
    const context = createContext({
      evaluateInDevToolsTab: vi.fn().mockResolvedValue({
        handled: true,
        action: "click",
        clickedText: "Authorize app",
      }),
    });

    const result = await oauthAutomation.authorize(context);

    expect(result.handled).toBe(true);
    expect(context.evaluateInDevToolsTab).toHaveBeenCalledTimes(1);
  });

  it("retries until a blocking reason surfaces", async () => {
    const evaluations = [
      { handled: false, reason: "button-not-found" },
      {
        handled: false,
        reason: "not-twitter",
        url: "https://x.com/oauth2/authorize",
        title: "Sweetistics wants access",
        host: "x.com",
      },
    ];
    const context = createContext({
      evaluateInDevToolsTab: vi.fn().mockImplementation(async () => evaluations.shift() ?? null),
    });

    const result = await oauthAutomation.authorize(context);

    expect(result.reason).toBe("not-twitter");
    expect(result.url).toContain("x.com");
    expect(context.delay).toHaveBeenCalledOnce();
  });
});
