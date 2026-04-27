import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  SweetLinkSelectorCandidate,
  SweetLinkSelectorDiscoveryResult,
} from "../../shared/src/index.js";
import { createSweetLinkCommandId, type SweetLinkCommandResult } from "../../shared/src/index.js";
import { fetchJson } from "../http.js";
import { fetchCliToken } from "../token.js";
import type { CliConfig } from "../types.js";

export interface SweetLinkSessionSummaryResponse {
  readonly sessions: Array<{
    readonly sessionId: string;
    readonly codename?: string;
    readonly url: string;
    readonly title: string;
    readonly topOrigin: string;
    readonly createdAt: number;
    readonly lastSeenAt: number;
    readonly heartbeatMsAgo?: number;
    readonly consoleEventsBuffered?: number;
    readonly consoleErrorsBuffered?: number;
    readonly pendingCommandCount?: number;
    readonly socketState?: "open" | "closing" | "closed" | "connecting" | "unknown";
    readonly userAgent?: string;
    readonly lastConsoleEventAt?: number | null;
  }>;
}

export type SweetLinkSessionSummary = SweetLinkSessionSummaryResponse["sessions"][number];

export interface SweetLinkConsoleDump {
  readonly id: string;
  readonly timestamp: number;
  readonly level: string;
  readonly args: unknown[];
}

export interface RunScriptCommandOptions {
  readonly sessionId: string;
  readonly code: string;
  readonly timeoutMs: number;
  readonly captureConsole?: boolean;
}

export interface BuildClickScriptOptions {
  readonly selector: string;
  readonly scrollIntoView: boolean;
  readonly bubbles: boolean;
}

const VALID_SELECTOR_HOOKS = new Set(["data-target", "id", "aria", "role", "structure", "testid"]);
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODENAME_CACHE_PATH = path.join(os.homedir(), ".sweetlink", "session-codenames.json");

type CodenameCache = Record<string, string>;

async function loadCodenameCache(): Promise<CodenameCache> {
  try {
    const raw = await readFile(CODENAME_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as CodenameCache;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    /* ignore cache read issues */
  }
  return {};
}

async function saveCodenameCache(cache: CodenameCache): Promise<void> {
  try {
    const directory = path.dirname(CODENAME_CACHE_PATH);
    await mkdir(directory, { recursive: true });
    await writeFile(CODENAME_CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
  } catch {
    /* ignore cache write issues */
  }
}

async function stabilizeSessionCodenames(
  sessions: SweetLinkSessionSummary[],
): Promise<SweetLinkSessionSummary[]> {
  if (sessions.length === 0) {
    return sessions;
  }

  const cache = await loadCodenameCache();
  let cacheMutations = 0;

  const stabilized: SweetLinkSessionSummary[] = [];
  for (const session of sessions) {
    const cachedCodename = cache[session.sessionId];
    if (cachedCodename) {
      if (session.codename === cachedCodename) {
        stabilized.push(session);
      } else {
        cacheMutations += 1;
        stabilized.push({ ...session, codename: cachedCodename });
      }
      continue;
    }
    if (session.codename && session.codename.trim().length > 0) {
      cache[session.sessionId] = session.codename;
      cacheMutations += 1;
    }
    stabilized.push(session);
  }

  if (cacheMutations > 0) {
    await saveCodenameCache(cache);
  }

  return stabilized;
}

export async function fetchSessionSummaries(
  config: CliConfig,
  existingToken?: string,
): Promise<SweetLinkSessionSummary[]> {
  const token = existingToken ?? (await fetchCliToken(config));
  const response = await fetchJson<SweetLinkSessionSummaryResponse>(
    `${config.daemonBaseUrl}/sessions`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return await stabilizeSessionCodenames(response.sessions);
}

/** Formats a session id + codename pair for CLI display. */
export function formatSessionHeadline(session: { sessionId: string; codename?: string }): string {
  return session.codename ? `${session.codename} (${session.sessionId})` : session.sessionId;
}

/** Resolves a human codename or short id to an active SweetLink session. */
export async function resolveSessionIdFromHint(
  sessionHint: string,
  config: CliConfig,
): Promise<string> {
  const input = sessionHint.trim();
  if (input.length === 0) {
    throw new Error("A SweetLink session identifier is required.");
  }
  if (SESSION_ID_PATTERN.test(input)) {
    return input;
  }

  const sessions = await fetchSessionSummaries(config);

  const normalized = input.toLowerCase();
  const matches = sessions.filter((session) => {
    if (session.sessionId === input || session.sessionId.toLowerCase() === normalized) {
      return true;
    }
    if (session.codename && session.codename.toLowerCase() === normalized) {
      return true;
    }
    return false;
  });

  if (matches.length === 0) {
    throw new Error(
      `No active SweetLink session matches "${sessionHint}". Run \`pnpm sweetlink sessions\` to list active sessions.`,
    );
  }

  if (matches.length > 1) {
    const headlines = matches.map((session) => formatSessionHeadline(session)).join(", ");
    throw new Error(
      `Multiple SweetLink sessions match "${sessionHint}". Refine using one of: ${headlines}.`,
    );
  }

  const match = matches[0];
  if (!match) {
    throw new Error("Unexpected missing SweetLink session match.");
  }
  return match.sessionId;
}

/** Sends a SweetLink runScript command and returns the raw command result. */
export async function executeRunScriptCommand(
  config: CliConfig,
  options: RunScriptCommandOptions,
): Promise<SweetLinkCommandResult> {
  const token = await fetchCliToken(config);
  const payload = {
    type: "runScript" as const,
    id: createSweetLinkCommandId(),
    code: options.code,
    timeoutMs: options.timeoutMs,
    captureConsole: Boolean(options.captureConsole),
  };

  const result = await fetchJson<{ result: SweetLinkCommandResult }>(
    `${config.daemonBaseUrl}/sessions/${encodeURIComponent(options.sessionId)}/command`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  return result.result;
}

/** Returns recent console events captured for a SweetLink session. */
export async function fetchConsoleEvents(
  config: CliConfig,
  sessionId: string,
): Promise<SweetLinkConsoleDump[]> {
  const token = await fetchCliToken(config);
  const response = await fetchJson<{ sessionId: string; events: SweetLinkConsoleDump[] }>(
    `${config.daemonBaseUrl}/sessions/${encodeURIComponent(sessionId)}/console`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return Array.isArray(response.events) ? response.events : [];
}

export async function getSessionSummaryById(
  config: CliConfig,
  token: string,
  sessionId: string,
): Promise<SweetLinkSessionSummary | undefined> {
  const sessions = await fetchSessionSummaries(config, token);
  return sessions.find((session) => session.sessionId === sessionId);
}

/** Returns the resolved prompt string for CLI commands. */
export function resolvePromptOption(options: {
  prompt?: string;
  question?: string;
}): string | undefined {
  const trimmedPrompt = options.prompt?.trim();
  if (trimmedPrompt) {
    return trimmedPrompt;
  }

  const trimmedQuestion = options.question?.trim();
  if (trimmedQuestion) {
    return trimmedQuestion;
  }

  return;
}

/** Builds a DOM click script scoped to the provided selector. */
export function buildClickScript({
  selector,
  scrollIntoView,
  bubbles,
}: BuildClickScriptOptions): string {
  const safeSelector = JSON.stringify(selector);
  const notFoundMessage = `SweetLink click: selector ${selector} not found`;

  const lines: string[] = [
    "(() => {",
    `  const target = document.querySelector(${safeSelector});`,
    "  if (!target) {",
    `    throw new Error(${JSON.stringify(notFoundMessage)});`,
    "  }",
  ];

  if (scrollIntoView) {
    lines.push(
      '  if (typeof target.scrollIntoView === "function") {',
      "    try {",
      '      target.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });',
      "    } catch {",
      "      target.scrollIntoView();",
      "    }",
      "  }",
    );
  }

  lines.push(
    '  const event = new MouseEvent("click", {',
    "    view: window,",
    `    bubbles: ${bubbles},`,
    "    cancelable: true,",
    "    composed: true",
    "  });",
    "  target.dispatchEvent(event);",
    '  if (typeof target.click === "function") {',
    "    target.click();",
    "  }",
    '  return "clicked";',
    "})()",
  );

  return lines.join("\n");
}

/** Shared guard ensuring candidates from selector discovery are valid. */
export const isSweetLinkSelectorCandidate = (
  value: unknown,
): value is SweetLinkSelectorCandidate => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.selector !== "string" ||
    typeof candidate.tagName !== "string" ||
    typeof candidate.hook !== "string" ||
    !VALID_SELECTOR_HOOKS.has(candidate.hook) ||
    typeof candidate.textSnippet !== "string" ||
    typeof candidate.score !== "number" ||
    typeof candidate.visible !== "boolean" ||
    typeof candidate.path !== "string"
  ) {
    return false;
  }
  const size = candidate.size as Record<string, unknown> | undefined;
  const position = candidate.position as Record<string, unknown> | undefined;
  if (!size || typeof size.width !== "number" || typeof size.height !== "number") {
    return false;
  }
  if (!position || typeof position.top !== "number" || typeof position.left !== "number") {
    return false;
  }
  return true;
};

/** Wrapper guards selector discovery responses. */
export const isSweetLinkSelectorDiscoveryResult = (
  value: unknown,
): value is SweetLinkSelectorDiscoveryResult => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.candidates)) {
    return false;
  }
  return record.candidates.every((candidate) => isSweetLinkSelectorCandidate(candidate));
};
