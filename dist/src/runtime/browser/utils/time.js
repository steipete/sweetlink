export const normalizeExpiresAtMs = (expiresAt) => {
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
        return null;
    }
    return expiresAt > 10000000000 ? expiresAt : expiresAt * 1000;
};
//# sourceMappingURL=time.js.map