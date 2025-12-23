import { sweetLinkDebug } from '../env.js';
/** Extracts a readable message from unknown error-like values. */
export function extractEventMessage(event, prefix) {
    const parts = [];
    if (prefix) {
        parts.push(prefix);
    }
    if (typeof event === 'string') {
        parts.push(event);
    }
    else if (event instanceof Error) {
        parts.push(event.message || event.name || 'Unknown error');
    }
    else if (event && typeof event === 'object' && 'message' in event) {
        const message = event.message;
        parts.push(typeof message === 'string' ? message : JSON.stringify(message));
    }
    else {
        parts.push(String(event));
    }
    return parts.join(': ');
}
/** Type guard for Node errno exceptions. */
export function isErrnoException(value) {
    return typeof value === 'object' && value !== null && typeof value.code === 'string';
}
/** Formats unknown values for human-readable logging. */
export function describeUnknown(value, fallback = 'unknown') {
    if (value === null || value === undefined) {
        return fallback;
    }
    if (value instanceof Error) {
        return value.message || value.name || fallback;
    }
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return String(value);
    }
    try {
        return JSON.stringify(value);
    }
    catch {
        return fallback;
    }
}
/** Emits a warning when debug logging is enabled. */
export function logDebugError(context, error) {
    if (!sweetLinkDebug) {
        return;
    }
    const message = error instanceof Error ? error.message : describeUnknown(error);
    console.warn(`[SweetLink CLI] ${context}: ${message}`, error);
}
//# sourceMappingURL=errors.js.map