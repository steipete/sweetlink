import { regex } from 'arkregex';
import { compact } from 'es-toolkit';
import { chromium, } from 'playwright-core';
import { WebSocket } from 'undici';
import { sweetLinkDebug } from '../../env.js';
import { describeUnknown, extractEventMessage } from '../../util/errors.js';
import { delay } from '../../util/time.js';
import { DEVTOOLS_PORT_SCAN_END, DEVTOOLS_PORT_SCAN_START } from '../chrome/reuse/constants.js';
import { urlsRoughlyMatch } from '../url.js';
const isDevToolsResponse = (value) => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const record = value;
    if (record.id !== undefined && typeof record.id !== 'number') {
        return false;
    }
    if (record.error !== undefined) {
        if (typeof record.error !== 'object' || record.error === null) {
            return false;
        }
        const errorRecord = record.error;
        if (errorRecord.message !== undefined && typeof errorRecord.message !== 'string') {
            return false;
        }
    }
    return true;
};
const ECONNREFUSED_PATTERN = regex.as('ECONNREFUSED');
export async function collectBootstrapDiagnostics(devtoolsUrl, candidates) {
    for (const candidate of candidates) {
        try {
            // biome-ignore lint/performance/noAwaitInLoops: stop after the first tab that yields diagnostics.
            const result = await evaluateInDevToolsTab(devtoolsUrl, candidate, `(function () {
          const summary = {
            readyState: document.readyState,
            autoFlag: Boolean(window.__sweetlinkCliAuto),
            bootstrapEmits: Number(window.__sweetlinkBootstrapEmits || 0),
            sessionStorageAuto: null,
            locationHref: location.href,
            locationPathname: location.pathname,
            errors: [],
            overlayText: null,
            nextRouteError: null,
          };

          try {
            summary.sessionStorageAuto = sessionStorage.getItem('sweetlink:auto');
          } catch {
            summary.sessionStorageAuto = null;
          }

          const store = window.__sweetlinkCliErrors;
          if (Array.isArray(store) && store.length) {
            summary.errors = store.slice(-5).map((entry) => {
              const safe = entry && typeof entry === 'object' ? entry : {};
              const type =
                typeof safe.type === 'string' ? safe.type : safe.type != null ? String(safe.type) : 'error';
              const message =
                typeof safe.message === 'string' ? safe.message : String(safe.message ?? '');
              const source = typeof safe.source === 'string' ? safe.source : null;
              const stack = typeof safe.stack === 'string' ? safe.stack : null;
              const timestamp = typeof safe.timestamp === 'number' ? safe.timestamp : null;
              const status = typeof safe.status === 'number' ? safe.status : null;
              return { type, message, source, stack, status, timestamp };
            });
          }

          const overlay =
            document.querySelector('[data-nextjs-error-overlay-root]') ||
            document.querySelector('[data-nextjs-error-overlay]') ||
            document.querySelector('#__nextjs__container_errors');
          if (overlay && typeof overlay.textContent === 'string') {
            summary.overlayText = overlay.textContent.slice(0, 500);
          }

          const nextData = typeof window.__NEXT_DATA__ === 'object' ? window.__NEXT_DATA__ : null;
          if (nextData && nextData.err) {
            const err = nextData.err;
            const message =
              err && typeof err === 'object' && 'message' in err ? String(err.message ?? '') : String(err);
            const digest =
              err && typeof err === 'object' && 'digest' in err ? String(err.digest ?? '') : null;
            summary.nextRouteError = { message, digest };
          }

          return summary;
        })()`);
            if (result && typeof result === 'object') {
                return result;
            }
        }
        catch {
            /* ignore and try next candidate */
        }
    }
    return null;
}
export async function discoverDevToolsEndpoints() {
    const ports = [];
    for (let port = DEVTOOLS_PORT_SCAN_START; port <= DEVTOOLS_PORT_SCAN_END; port += 1) {
        ports.push(port);
    }
    const results = await Promise.all(ports.map(async (port) => {
        const baseUrl = `http://127.0.0.1:${port}`;
        try {
            const response = await fetch(`${baseUrl}/json/version`, { method: 'GET' });
            if (response.ok) {
                return baseUrl;
            }
        }
        catch {
            /* ignore */
        }
        return null;
    }));
    return results.filter((url) => typeof url === 'string');
}
export async function fetchDevToolsTabs(devtoolsUrl) {
    const response = await fetch(`${devtoolsUrl}/json/list`, { method: 'GET' });
    if (!response.ok) {
        throw new Error(`DevTools endpoint responded with ${response.status}`);
    }
    const payload = (await response.json());
    if (!Array.isArray(payload)) {
        throw new TypeError('DevTools endpoint returned unexpected payload');
    }
    return compact(payload.map((entry) => {
        if (!entry || typeof entry !== 'object') {
            return null;
        }
        const record = entry;
        const id = typeof record.id === 'string' ? record.id : null;
        const title = typeof record.title === 'string' ? record.title : '';
        const url = typeof record.url === 'string' ? record.url : '';
        const type = typeof record.type === 'string' ? record.type : undefined;
        const webSocketDebuggerUrl = typeof record.webSocketDebuggerUrl === 'string' ? record.webSocketDebuggerUrl : undefined;
        if (!(id && url)) {
            return null;
        }
        return { id, title, url, type, webSocketDebuggerUrl };
    }));
}
export async function fetchDevToolsTabsWithRetry(devtoolsUrl, attempts = 5) {
    const delayMs = 200;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            // biome-ignore lint/performance/noAwaitInLoops: retries must run sequentially with backoff.
            const tabs = await fetchDevToolsTabs(devtoolsUrl);
            if (tabs.length > 0) {
                return tabs;
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!ECONNREFUSED_PATTERN.test(message)) {
                throw error;
            }
        }
        await delay(delayMs);
    }
    return [];
}
export async function evaluateInDevToolsTab(devtoolsUrl, targetUrl, expression) {
    const tabs = await fetchDevToolsTabsWithRetry(devtoolsUrl);
    if (tabs.length === 0) {
        throw new Error('No DevTools tabs available');
    }
    const candidate = tabs.find((tab) => tab.url === targetUrl && tab.webSocketDebuggerUrl) ||
        tabs.find((tab) => urlsRoughlyMatch(tab.url, targetUrl) && tab.webSocketDebuggerUrl) ||
        tabs.find((tab) => tab.webSocketDebuggerUrl);
    if (!candidate?.webSocketDebuggerUrl) {
        throw new Error('DevTools tab does not expose a debugger WebSocket URL');
    }
    const socket = new WebSocket(candidate.webSocketDebuggerUrl);
    let nextId = 0;
    const pending = new Map();
    const sendCommand = (method, params = {}) => {
        nextId += 1;
        const id = nextId;
        return new Promise((resolve, reject) => {
            pending.set(id, {
                resolve: (value) => resolve(value),
                reject,
            });
            const payload = JSON.stringify({ id, method, params });
            socket.send(payload);
        });
    };
    const awaitDocumentReady = async () => {
        for (let attempt = 0; attempt < 50; attempt += 1) {
            try {
                // biome-ignore lint/performance/noAwaitInLoops: document readiness must be polled sequentially.
                const result = await sendCommand('Runtime.evaluate', {
                    expression: 'document.readyState',
                    returnByValue: true,
                });
                const state = result.result?.value ??
                    (typeof result.result?.result === 'object' && result.result?.result !== null
                        ? result.result.result.value
                        : undefined);
                if (state === 'complete' || state === 'interactive') {
                    return;
                }
            }
            catch {
                /* ignore and retry */
            }
            await delay(150);
        }
    };
    const cleanup = () => {
        pending.clear();
        try {
            socket.close();
        }
        catch (error) {
            if (sweetLinkDebug) {
                console.warn('DevTools socket close failed during cleanup.', error);
            }
        }
    };
    return await new Promise((resolve, reject) => {
        const handleOpen = async () => {
            try {
                await sendCommand('Runtime.enable');
                await awaitDocumentReady();
                const evalResult = await sendCommand('Runtime.evaluate', {
                    expression,
                    awaitPromise: true,
                    returnByValue: true,
                });
                cleanup();
                resolve(evalResult.result?.value ??
                    (typeof evalResult.result?.result === 'object' && evalResult.result?.result !== null
                        ? evalResult.result.result.value
                        : null));
            }
            catch (error) {
                cleanup();
                const rejection = error instanceof Error ? error : new Error(describeUnknown(error, 'DevTools evaluation failed'));
                reject(rejection);
            }
        };
        socket.addEventListener('open', () => {
            handleOpen().catch((error) => {
                if (sweetLinkDebug) {
                    console.warn('DevTools open handler failed before evaluation began.', error);
                }
            });
        });
        socket.addEventListener('message', (event) => {
            let data = null;
            if (typeof event.data === 'string') {
                try {
                    const parsed = JSON.parse(event.data);
                    if (isDevToolsResponse(parsed)) {
                        data = parsed;
                    }
                    else if (sweetLinkDebug) {
                        console.warn('Received DevTools payload with unexpected shape.', parsed);
                    }
                }
                catch (parseError) {
                    if (sweetLinkDebug) {
                        console.warn('Received malformed DevTools response.', parseError);
                    }
                }
            }
            else if (sweetLinkDebug) {
                const payloadSummary = typeof event.data === 'string' || typeof event.data === 'number' || typeof event.data === 'boolean'
                    ? event.data
                    : (() => {
                        try {
                            return JSON.stringify(event.data);
                        }
                        catch {
                            return '[unserializable payload]';
                        }
                    })();
                console.warn('Received non-string DevTools response.', { data: payloadSummary });
            }
            if (!data || typeof data.id !== 'number') {
                return;
            }
            const handlers = pending.get(data.id);
            if (!handlers) {
                return;
            }
            pending.delete(data.id);
            if (data.error) {
                handlers.reject(new Error(data.error.message ?? 'DevTools command failed'));
            }
            else {
                handlers.resolve(data.result);
            }
        });
        socket.addEventListener('error', (event) => {
            cleanup();
            const message = extractEventMessage(event, 'DevTools socket error');
            reject(new Error(message));
        });
        socket.addEventListener('close', () => {
            if (pending.size > 0) {
                reject(new Error('DevTools socket closed before command completed'));
            }
        });
    });
}
export async function connectToDevTools(config) {
    try {
        const browser = await chromium.connectOverCDP(config.devtoolsUrl, { timeout: 10_000 });
        const page = resolveDevToolsPage(browser, config);
        return { browser, page };
    }
    catch (error) {
        throw new Error(`ConnectOverCDP failed: ${extractEventMessage(error)}`);
    }
}
export function resolveDevToolsPage(browser, config) {
    const contexts = browser.contexts();
    const allPages = contexts.flatMap((ctx) => ctx.pages());
    const { targetUrl } = config;
    if (targetUrl) {
        const match = allPages.find((p) => urlsRoughlyMatch(p.url(), targetUrl));
        if (match) {
            return match;
        }
    }
    if (allPages.length > 0) {
        const [firstPage] = allPages;
        if (firstPage) {
            return firstPage;
        }
    }
    throw new Error('No pages found in controlled Chrome window');
}
export async function serializeConsoleMessage(message) {
    const args = await Promise.all(message.args().map(async (handle) => {
        try {
            return await handle.jsonValue();
        }
        catch {
            try {
                return await handle.evaluate((value) => {
                    if (typeof value === 'string') {
                        return value;
                    }
                    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
                        return String(value);
                    }
                    try {
                        return JSON.stringify(value);
                    }
                    catch {
                        return Object.prototype.toString.call(value);
                    }
                });
            }
            catch {
                return '[unserializable]';
            }
        }
    }));
    const location = message.location();
    return {
        ts: Date.now(),
        type: message.type(),
        text: message.text(),
        args,
        location: location?.url
            ? {
                url: location.url,
                lineNumber: location.lineNumber,
                columnNumber: location.columnNumber,
            }
            : undefined,
    };
}
export function createEmptyDevToolsState(endpoint) {
    return {
        endpoint,
        console: [],
        network: [],
        updatedAt: Date.now(),
    };
}
export function trimBuffer(buffer, limit) {
    if (buffer.length > limit) {
        buffer.splice(0, buffer.length - limit);
    }
}
//# sourceMappingURL=cdp.js.map