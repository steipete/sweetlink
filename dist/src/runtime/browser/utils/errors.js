export const toError = (error) => {
    if (error instanceof Error) {
        return error;
    }
    if (typeof error === 'string') {
        return new Error(error);
    }
    return new Error(describeUnknown(error));
};
export const describeUnknown = (value) => {
    if (value instanceof Error) {
        return value.message;
    }
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value.toString() : 'NaN';
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (typeof value === 'symbol') {
        return value.description ?? 'Symbol';
    }
    if (value === null) {
        return 'null';
    }
    if (value === undefined) {
        return 'undefined';
    }
    try {
        return JSON.stringify(value);
    }
    catch {
        return Object.prototype.toString.call(value);
    }
};
//# sourceMappingURL=errors.js.map