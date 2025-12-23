export const normalizeExpiresAtMs = (expiresAt) => {
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
        return null;
    }
    return expiresAt > 10_000_000_000 ? expiresAt : expiresAt * 1000;
};
//# sourceMappingURL=time.js.map