export const normalizeExpiresAtMs = (expiresAt: unknown): number | null => {
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) {
    return null;
  }
  return expiresAt > 10_000_000_000 ? expiresAt : expiresAt * 1000;
};
