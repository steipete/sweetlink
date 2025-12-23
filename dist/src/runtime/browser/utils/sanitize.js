export function sanitizeResult(value) {
    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            stack: value.stack,
        };
    }
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (typeof value === 'function') {
        return value.toString();
    }
    try {
        return structuredClone(value);
    }
    catch {
        try {
            const serialized = JSON.stringify(value);
            return JSON.parse(serialized);
        }
        catch {
            return String(value);
        }
    }
}
//# sourceMappingURL=sanitize.js.map