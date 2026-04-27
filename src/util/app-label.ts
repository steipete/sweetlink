import { regex } from "arkregex";

export const DEFAULT_APP_LABEL = "your application";
const LEADING_ARTICLE_PATTERN = regex.as(String.raw`^(?:the|a|an|your)\b`, "i");

export function normalizeAppLabel(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function formatAppLabel(label: string | null | undefined): string {
  return normalizeAppLabel(label) ?? DEFAULT_APP_LABEL;
}

export function describeAppForPrompt(label: string | null | undefined): string {
  const formatted = formatAppLabel(label);
  if (LEADING_ARTICLE_PATTERN.test(formatted)) {
    return formatted;
  }
  return `the "${formatted}" application`;
}
