import { logDebugError } from '../util/errors.js';
const ACCEPT_HEADER = 'application/json, text/event-stream';
async function callNextDevtoolsTool(origin, toolName, args = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
        const response = await fetch(`${origin}/_next/mcp`, {
            method: 'POST',
            headers: {
                Accept: ACCEPT_HEADER,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: `${Date.now()}`,
                method: 'tools/call',
                params: {
                    name: toolName,
                    arguments: args,
                },
            }),
            signal: controller.signal,
        });
        if (!response.ok) {
            return;
        }
        const raw = await response.text();
        const dataLine = raw
            .split('\n')
            .map((line) => line.trim())
            .find((line) => line.startsWith('data:'));
        if (!dataLine) {
            return;
        }
        const payload = dataLine.slice(5).trim();
        if (!payload) {
            return;
        }
        return JSON.parse(payload);
    }
    catch (error) {
        logDebugError('Next DevTools call failed', error);
        return;
    }
    finally {
        clearTimeout(timeout);
    }
}
export async function fetchNextDevtoolsErrors(targetUrl) {
    let origin;
    try {
        origin = new URL(targetUrl).origin;
    }
    catch {
        return null;
    }
    const result = await callNextDevtoolsTool(origin, 'get_errors');
    const content = result?.result?.content;
    if (!Array.isArray(content) || content.length === 0) {
        return null;
    }
    const textChunk = content.find((entry) => entry?.type === 'text' && typeof entry.text === 'string');
    if (!textChunk?.text) {
        return null;
    }
    const normalized = textChunk.text.trim();
    if (normalized.toLowerCase().startsWith('no errors detected')) {
        return null;
    }
    return normalized;
}
//# sourceMappingURL=next-devtools.js.map