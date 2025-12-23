import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'undici';
import { sweetLinkDebug } from './env.js';
const DEVTOOLS_REGISTRY_PATH = path.join(os.homedir(), '.sweetlink', 'devtools-registry.json');
const TRAILING_SLASH_PATTERN = /\/$/;
const OPTIONAL_TRAILING_SLASH_PATTERN = /\/?$/;
const SWEETLINK_CHROME_DIR_PATTERN = /sweetlink-chrome-(\d+)-/;
const SWEETLINK_CHROME_PREFIX_PATTERN = /^sweetlink-chrome-(\d+)-/;
function normalizeDevtoolsUrl(input) {
    return input.replace(TRAILING_SLASH_PATTERN, '');
}
const DEBUG_DEVTOOLS_REGISTRY = sweetLinkDebug;
const parseDebuggerMessage = (raw) => {
    if (typeof raw !== 'string') {
        return null;
    }
    try {
        return JSON.parse(raw);
    }
    catch (error) {
        if (DEBUG_DEVTOOLS_REGISTRY) {
            console.warn('[SweetLink CLI] Ignoring malformed DevTools message payload.', error);
        }
    }
    return null;
};
async function loadRegistry() {
    try {
        const raw = await readFile(DEVTOOLS_REGISTRY_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.map((entry) => ({
                devtoolsUrl: normalizeDevtoolsUrl(entry.devtoolsUrl),
                userDataDirectory: entry.userDataDirectory,
                lastSeenAt: entry.lastSeenAt ?? Date.now(),
            }));
        }
    }
    catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn('[SweetLink CLI] Failed to read DevTools registry:', error);
        }
    }
    return [];
}
async function saveRegistry(registry) {
    const directory = path.dirname(DEVTOOLS_REGISTRY_PATH);
    await mkdir(directory, { recursive: true });
    await writeFile(DEVTOOLS_REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');
}
export async function registerControlledChromeInstance(devtoolsUrl, userDataDirectory) {
    if (!userDataDirectory?.includes('sweetlink-chrome-')) {
        return;
    }
    let portSegment = null;
    try {
        const parsed = new URL(devtoolsUrl);
        if (parsed.port) {
            portSegment = parsed.port;
        }
        else if (parsed.protocol === 'http:') {
            portSegment = '80';
        }
        else if (parsed.protocol === 'https:') {
            portSegment = '443';
        }
        else {
            portSegment = null;
        }
    }
    catch {
        portSegment = null;
    }
    if (portSegment && !userDataDirectory.includes(`sweetlink-chrome-${portSegment}`)) {
        return;
    }
    const normalized = normalizeDevtoolsUrl(devtoolsUrl);
    const registry = await loadRegistry();
    const existing = registry.find((entry) => normalizeDevtoolsUrl(entry.devtoolsUrl) === normalized);
    if (existing) {
        existing.userDataDirectory = userDataDirectory;
        existing.lastSeenAt = Date.now();
    }
    else {
        registry.push({ devtoolsUrl: normalized, userDataDirectory, lastSeenAt: Date.now() });
    }
    await saveRegistry(registry);
}
export async function cleanupControlledChromeRegistry(activeDevtoolsUrl) {
    const normalizedActive = activeDevtoolsUrl ? normalizeDevtoolsUrl(activeDevtoolsUrl) : null;
    const registry = await loadRegistry();
    const next = [];
    for (const entry of registry) {
        const normalizedEntryUrl = normalizeDevtoolsUrl(entry.devtoolsUrl);
        let portSegment = null;
        try {
            const parsed = new URL(normalizedEntryUrl);
            if (parsed.port) {
                portSegment = parsed.port;
            }
            else if (parsed.protocol === 'http:') {
                portSegment = '80';
            }
            else if (parsed.protocol === 'https:') {
                portSegment = '443';
            }
            else {
                portSegment = null;
            }
        }
        catch {
            portSegment = null;
        }
        if (normalizedEntryUrl === normalizedActive) {
            if (portSegment &&
                entry.userDataDirectory &&
                !entry.userDataDirectory.includes(`sweetlink-chrome-${portSegment}`)) {
                const stalePortMatch = entry.userDataDirectory.match(SWEETLINK_CHROME_DIR_PATTERN);
                if (stalePortMatch) {
                    // biome-ignore lint/performance/noAwaitInLoops: chrome instances must close sequentially to avoid reusing stale ports.
                    await attemptCloseControlledChrome(`http://127.0.0.1:${stalePortMatch[1]}`);
                }
                continue;
            }
            entry.lastSeenAt = Date.now();
            next.push(entry);
            continue;
        }
        if (!entry.userDataDirectory.includes('sweetlink-chrome-')) {
            // Avoid touching DevTools instances we did not launch (e.g. manual overrides).
            next.push(entry);
            continue;
        }
        const closed = await attemptCloseControlledChrome(normalizedEntryUrl);
        if (!closed) {
            // Browser is already gone or could not be closed; drop the entry to avoid repeated attempts.
            continue;
        }
        console.log(`[SweetLink CLI] Closed stale controlled Chrome at ${normalizedEntryUrl}`);
    }
    await saveRegistry(next);
    await closeLingeringChromeProcesses(normalizedActive);
}
async function attemptCloseControlledChrome(devtoolsUrl) {
    const normalized = devtoolsUrl.replace(OPTIONAL_TRAILING_SLASH_PATTERN, '');
    try {
        const response = await fetch(`${normalized}/json/version`, { method: 'GET' });
        if (!response.ok) {
            return false;
        }
        const debuggerPayload = (await response.json());
        const wsUrl = debuggerPayload.webSocketDebuggerUrl;
        if (!wsUrl) {
            return false;
        }
        await new Promise((resolve, reject) => {
            let settleState = 'pending';
            const finish = (error = null) => {
                if (settleState === 'done') {
                    return;
                }
                settleState = 'done';
                if (error) {
                    if (error instanceof Error) {
                        reject(error);
                        return;
                    }
                    if (typeof error === 'string') {
                        reject(new Error(error));
                        return;
                    }
                    reject(new Error('Unknown DevTools close error'));
                }
                else {
                    resolve();
                }
            };
            const socket = new WebSocket(wsUrl);
            const timeout = setTimeout(() => {
                socket.close();
                finish(new Error('DevTools close timeout'));
            }, 2000);
            const maybeNodeTimer = timeout;
            if (typeof maybeNodeTimer?.unref === 'function') {
                maybeNodeTimer.unref();
            }
            socket.addEventListener('open', () => {
                socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
            });
            socket.addEventListener('message', (event) => {
                const messagePayload = parseDebuggerMessage(event.data);
                if (messagePayload?.id === 1) {
                    clearTimeout(timeout);
                    socket.close();
                    finish();
                }
            });
            socket.addEventListener('close', () => {
                clearTimeout(timeout);
                finish();
            });
            socket.addEventListener('error', (event) => {
                clearTimeout(timeout);
                const candidate = event;
                const message = typeof candidate.message === 'string' ? candidate.message : null;
                if (!message && candidate.error) {
                    finish(candidate.error);
                    return;
                }
                if (!message) {
                    console.warn('[SweetLink CLI] DevTools WebSocket reported an unknown error event.', { event });
                }
                finish(new Error(message ?? 'DevTools WebSocket reported an unknown error'));
            });
        });
        return true;
    }
    catch (error) {
        if (error instanceof Error) {
            const message = error.message || '';
            if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
                return false;
            }
            console.warn(`[SweetLink CLI] Unable to close stale controlled Chrome at ${devtoolsUrl}:`, message);
        }
        else {
            console.warn(`[SweetLink CLI] Unable to close stale controlled Chrome at ${devtoolsUrl}:`, error);
        }
        return false;
    }
}
async function closeLingeringChromeProcesses(activeDevtoolsUrl) {
    let activePort = null;
    if (activeDevtoolsUrl) {
        try {
            const parsed = new URL(activeDevtoolsUrl);
            if (parsed.port) {
                activePort = parsed.port;
            }
            else if (parsed.protocol === 'http:') {
                activePort = '80';
            }
            else if (parsed.protocol === 'https:') {
                activePort = '443';
            }
            else {
                activePort = null;
            }
        }
        catch {
            activePort = null;
        }
    }
    const processed = new Set();
    let entries;
    try {
        entries = await readdir(os.tmpdir());
    }
    catch {
        return;
    }
    const MAX_SWEEPS = 5;
    let sweeps = 0;
    for (const entry of entries) {
        const match = entry.match(SWEETLINK_CHROME_PREFIX_PATTERN);
        if (!match) {
            continue;
        }
        const portValue = match[1];
        if (!portValue) {
            continue;
        }
        const port = portValue;
        if (processed.has(port)) {
            continue;
        }
        processed.add(port);
        if (activePort && port === activePort) {
            continue;
        }
        // biome-ignore lint/performance/noAwaitInLoops: sequential port sweeps avoid throttling Chrome shutdown.
        const closed = await attemptCloseControlledChrome(`http://127.0.0.1:${port}`);
        sweeps += 1;
        if (sweeps >= MAX_SWEEPS) {
            break;
        }
        if (closed) {
            console.log(`[SweetLink CLI] Closed lingering Chrome instance at port ${port}`);
        }
    }
}
//# sourceMappingURL=devtools-registry.js.map