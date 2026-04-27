export const isRecord = <T extends Record<string, unknown>>(value: unknown): value is T =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export const toTrimmedNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};
