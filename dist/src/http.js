import { inspect } from 'node:util';
const formatCause = (cause) => {
    if (cause === null || cause === undefined) {
        return null;
    }
    if (cause instanceof Error) {
        return cause.message || cause.name;
    }
    if (typeof cause === 'string') {
        return cause;
    }
    if (typeof cause === 'number' || typeof cause === 'boolean') {
        return String(cause);
    }
    try {
        return inspect(cause, { depth: 2 });
    }
    catch {
        return null;
    }
};
export async function fetchJson(input, init) {
    try {
        const response = await fetch(input, init);
        if (!response.ok) {
            const body = await safeJson(response);
            const detail = body ? JSON.stringify(body) : `${response.status} ${response.statusText}`;
            throw new Error(`Request failed: ${detail}`);
        }
        return (await response.json());
    }
    catch (error) {
        if (error instanceof Error) {
            const formattedCause = formatCause(error.cause);
            const causeSuffix = formattedCause ? ` (cause: ${formattedCause})` : '';
            let message = `Request failed: ${error.message}${causeSuffix}`;
            if (message.includes('Session not found or offline')) {
                message += '\nHint: run `pnpm sweetlink sessions` to list active sessions and retry with a fresh id.';
            }
            error.message = message;
        }
        throw error;
    }
}
async function safeJson(response) {
    try {
        return await response.json();
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=http.js.map