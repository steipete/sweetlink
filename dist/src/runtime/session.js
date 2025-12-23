import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSweetLinkCommandId } from '../../shared/src/index.js';
import { fetchJson } from '../http.js';
import { fetchCliToken } from '../token.js';
const VALID_SELECTOR_HOOKS = new Set(['data-target', 'id', 'aria', 'role', 'structure', 'testid']);
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODENAME_CACHE_PATH = path.join(os.homedir(), '.sweetlink', 'session-codenames.json');
async function loadCodenameCache() {
    try {
        const raw = await readFile(CODENAME_CACHE_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            return parsed;
        }
    }
    catch {
        /* ignore cache read issues */
    }
    return {};
}
async function saveCodenameCache(cache) {
    try {
        const directory = path.dirname(CODENAME_CACHE_PATH);
        await mkdir(directory, { recursive: true });
        await writeFile(CODENAME_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
    }
    catch {
        /* ignore cache write issues */
    }
}
async function stabilizeSessionCodenames(sessions) {
    if (sessions.length === 0) {
        return sessions;
    }
    const cache = await loadCodenameCache();
    let cacheMutations = 0;
    const stabilized = [];
    for (const session of sessions) {
        const cachedCodename = cache[session.sessionId];
        if (cachedCodename) {
            if (session.codename === cachedCodename) {
                stabilized.push(session);
            }
            else {
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
export async function fetchSessionSummaries(config, existingToken) {
    const token = existingToken ?? (await fetchCliToken(config));
    const response = await fetchJson(`${config.daemonBaseUrl}/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    return await stabilizeSessionCodenames(response.sessions);
}
/** Formats a session id + codename pair for CLI display. */
export function formatSessionHeadline(session) {
    return session.codename ? `${session.codename} (${session.sessionId})` : session.sessionId;
}
/** Resolves a human codename or short id to an active SweetLink session. */
export async function resolveSessionIdFromHint(sessionHint, config) {
    const input = sessionHint.trim();
    if (input.length === 0) {
        throw new Error('A SweetLink session identifier is required.');
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
        throw new Error(`No active SweetLink session matches "${sessionHint}". Run \`pnpm sweetlink sessions\` to list active sessions.`);
    }
    if (matches.length > 1) {
        const headlines = matches.map((session) => formatSessionHeadline(session)).join(', ');
        throw new Error(`Multiple SweetLink sessions match "${sessionHint}". Refine using one of: ${headlines}.`);
    }
    const match = matches[0];
    if (!match) {
        throw new Error('Unexpected missing SweetLink session match.');
    }
    return match.sessionId;
}
/** Sends a SweetLink runScript command and returns the raw command result. */
export async function executeRunScriptCommand(config, options) {
    const token = await fetchCliToken(config);
    const payload = {
        type: 'runScript',
        id: createSweetLinkCommandId(),
        code: options.code,
        timeoutMs: options.timeoutMs,
        captureConsole: Boolean(options.captureConsole),
    };
    const result = await fetchJson(`${config.daemonBaseUrl}/sessions/${encodeURIComponent(options.sessionId)}/command`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    return result.result;
}
/** Returns recent console events captured for a SweetLink session. */
export async function fetchConsoleEvents(config, sessionId) {
    const token = await fetchCliToken(config);
    const response = await fetchJson(`${config.daemonBaseUrl}/sessions/${encodeURIComponent(sessionId)}/console`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    return Array.isArray(response.events) ? response.events : [];
}
export async function getSessionSummaryById(config, token, sessionId) {
    const sessions = await fetchSessionSummaries(config, token);
    return sessions.find((session) => session.sessionId === sessionId);
}
/** Returns the resolved prompt string for CLI commands. */
export function resolvePromptOption(options) {
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
export function buildClickScript({ selector, scrollIntoView, bubbles }) {
    const safeSelector = JSON.stringify(selector);
    const notFoundMessage = `SweetLink click: selector ${selector} not found`;
    const lines = [
        '(() => {',
        `  const target = document.querySelector(${safeSelector});`,
        '  if (!target) {',
        `    throw new Error(${JSON.stringify(notFoundMessage)});`,
        '  }',
    ];
    if (scrollIntoView) {
        lines.push('  if (typeof target.scrollIntoView === "function") {', '    try {', '      target.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });', '    } catch {', '      target.scrollIntoView();', '    }', '  }');
    }
    lines.push('  const event = new MouseEvent("click", {', '    view: window,', `    bubbles: ${bubbles},`, '    cancelable: true,', '    composed: true', '  });', '  target.dispatchEvent(event);', '  if (typeof target.click === "function") {', '    target.click();', '  }', '  return "clicked";', '})()');
    return lines.join('\n');
}
/** Shared guard ensuring candidates from selector discovery are valid. */
export const isSweetLinkSelectorCandidate = (value) => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const candidate = value;
    if (typeof candidate.selector !== 'string' ||
        typeof candidate.tagName !== 'string' ||
        typeof candidate.hook !== 'string' ||
        !VALID_SELECTOR_HOOKS.has(candidate.hook) ||
        typeof candidate.textSnippet !== 'string' ||
        typeof candidate.score !== 'number' ||
        typeof candidate.visible !== 'boolean' ||
        typeof candidate.path !== 'string') {
        return false;
    }
    const size = candidate.size;
    const position = candidate.position;
    if (!size || typeof size.width !== 'number' || typeof size.height !== 'number') {
        return false;
    }
    if (!position || typeof position.top !== 'number' || typeof position.left !== 'number') {
        return false;
    }
    return true;
};
/** Wrapper guards selector discovery responses. */
export const isSweetLinkSelectorDiscoveryResult = (value) => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const record = value;
    if (!Array.isArray(record.candidates)) {
        return false;
    }
    return record.candidates.every((candidate) => isSweetLinkSelectorCandidate(candidate));
};
//# sourceMappingURL=session.js.map