import { regex } from 'arkregex';
export const DEFAULT_APP_LABEL = 'your application';
const LEADING_ARTICLE_PATTERN = regex.as(String.raw `^(?:the|a|an|your)\b`, 'i');
export function normalizeAppLabel(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
export function formatAppLabel(label) {
    return normalizeAppLabel(label) ?? DEFAULT_APP_LABEL;
}
export function describeAppForPrompt(label) {
    const formatted = formatAppLabel(label);
    if (LEADING_ARTICLE_PATTERN.test(formatted)) {
        return formatted;
    }
    return `the "${formatted}" application`;
}
//# sourceMappingURL=app-label.js.map