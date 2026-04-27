import { regex } from "arkregex";
import { beforeEach, describe, expect, it, vi } from "vitest";

const MULTIPLE_SESSIONS_PATTERN = regex.as("Multiple SweetLink sessions");
import type { CliConfig } from "../../src/types";

const fetchJsonMock = vi.fn();
const fetchCliTokenMock = vi.fn().mockResolvedValue("cli-token");
const readFileMock = vi.fn();
const writeFileMock = vi.fn();
const mkdirMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../../src/http", () => ({
  fetchJson: fetchJsonMock,
}));

vi.mock("../../src/token", () => ({
  fetchCliToken: fetchCliTokenMock,
}));

vi.mock("node:fs/promises", () => ({
  readFile: readFileMock,
  writeFile: writeFileMock,
  mkdir: mkdirMock,
}));

vi.mock("node:os", () => ({
  default: { homedir: () => "/tmp" },
  homedir: () => "/tmp",
}));

const sessionModule = await import("../../src/runtime/session");
const {
  fetchSessionSummaries,
  resolveSessionIdFromHint,
  resolvePromptOption,
  buildClickScript,
  isSweetLinkSelectorCandidate,
  isSweetLinkSelectorDiscoveryResult,
  fetchConsoleEvents,
  getSessionSummaryById,
} = sessionModule;

const config: CliConfig = {
  appLabel: "SweetLink Test",
  appBaseUrl: "https://app.test.dev",
  daemonBaseUrl: "https://daemon.dev",
  adminApiKey: null,
  oauthScriptPath: null,
  servers: {},
};

beforeEach(() => {
  vi.restoreAllMocks();
  fetchJsonMock.mockReset();
  fetchCliTokenMock.mockClear();
  readFileMock.mockReset();
  writeFileMock.mockReset();
  mkdirMock.mockClear();
});

describe("fetchSessionSummaries", () => {
  it("stabilizes codename caches and persists mutations", async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify({ "session-1": "CachedName" }));
    fetchJsonMock.mockResolvedValueOnce({
      sessions: [
        {
          sessionId: "session-1",
          codename: "FreshName",
          url: "https://example.dev",
          title: "Dashboard",
          topOrigin: "https://example.dev",
          createdAt: Date.now(),
          lastSeenAt: Date.now(),
        },
      ],
    });

    const sessions = await fetchSessionSummaries(config);

    expect(sessions[0]?.codename).toBe("CachedName");
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringContaining("session-codenames.json"),
      expect.stringContaining("CachedName"),
      "utf8",
    );
  });
});

describe("resolveSessionIdFromHint", () => {
  it("returns ids for direct matches or via codename lookup", async () => {
    readFileMock.mockRejectedValue(new Error("missing"));
    fetchJsonMock.mockResolvedValue({
      sessions: [
        {
          sessionId: "session-2",
          codename: "Alpha",
          url: "",
          title: "",
          topOrigin: "",
          createdAt: 0,
          lastSeenAt: 0,
        },
      ],
    });

    await expect(resolveSessionIdFromHint("session-2", config)).resolves.toBe("session-2");
    await expect(resolveSessionIdFromHint("alpha", config)).resolves.toBe("session-2");
  });

  it("raises errors when multiple sessions match", async () => {
    fetchJsonMock.mockResolvedValue({
      sessions: [
        {
          sessionId: "session-3",
          codename: "beta",
          url: "",
          title: "",
          topOrigin: "",
          createdAt: 0,
          lastSeenAt: 0,
        },
        {
          sessionId: "session-4",
          codename: "beta",
          url: "",
          title: "",
          topOrigin: "",
          createdAt: 0,
          lastSeenAt: 0,
        },
      ],
    });

    await expect(resolveSessionIdFromHint("beta", config)).rejects.toThrow(
      MULTIPLE_SESSIONS_PATTERN,
    );
  });
});

describe("prompt and selector helpers", () => {
  it("prefers prompt text over question fallbacks", () => {
    expect(resolvePromptOption({ prompt: " Explain  " })).toBe("Explain");
    expect(resolvePromptOption({ question: " Why?" })).toBe("Why?");
    expect(resolvePromptOption({})).toBeUndefined();
  });

  it("builds click scripts with optional scroll logic", () => {
    const script = buildClickScript({ selector: "#cta", scrollIntoView: true, bubbles: false });
    expect(script).toContain('querySelector("#cta")');
    expect(script).toContain("scrollIntoView");
    expect(script).toContain("bubbles: false");
  });

  it("validates selector candidates and discovery results", () => {
    const candidate = {
      selector: "#cta",
      tagName: "button",
      hook: "data-target",
      textSnippet: "Click me",
      score: 0.8,
      visible: true,
      path: "/html/body",
      size: { width: 100, height: 40 },
      position: { top: 10, left: 20 },
    };
    expect(isSweetLinkSelectorCandidate(candidate)).toBe(true);
    expect(isSweetLinkSelectorDiscoveryResult({ candidates: [candidate] })).toBe(true);
    expect(isSweetLinkSelectorCandidate({})).toBe(false);
  });
});

describe("session fetch helpers", () => {
  it("returns console events with auth headers", async () => {
    fetchJsonMock.mockResolvedValueOnce({ sessionId: "session-5", events: [{ id: "e1" }] });

    const events = await fetchConsoleEvents(config, "session-5");

    expect(events).toEqual([{ id: "e1" }]);
    expect(fetchCliTokenMock).toHaveBeenCalled();
  });

  it("finds session summaries by id when a token is provided", async () => {
    fetchJsonMock.mockResolvedValueOnce({
      sessions: [
        {
          sessionId: "session-6",
          codename: "Gamma",
          url: "",
          title: "",
          topOrigin: "",
          createdAt: 0,
          lastSeenAt: 0,
        },
      ],
    });

    const match = await getSessionSummaryById(config, "existing-token", "session-6");

    expect(match?.codename).toBe("Gamma");
  });
});
