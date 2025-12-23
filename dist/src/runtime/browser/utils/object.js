export const isRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export const toTrimmedNonEmptyString = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};
//# sourceMappingURL=object.js.map