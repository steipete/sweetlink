import { randomInt } from 'node:crypto';
import { generateSlug } from 'random-word-slugs';
const MAX_ATTEMPTS = 12;
const ensureNonEmptyString = (value, label) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new TypeError(`${label} must return a non-empty string`);
    }
    return value;
};
const defaultSlugFactory = () => {
    const slug = generateSlug(2, {
        partsOfSpeech: ['adjective', 'noun'],
        format: 'kebab',
    });
    return ensureNonEmptyString(slug, 'slugFactory');
};
const defaultSaltFactory = () => randomInt(36 ** 2)
    .toString(36)
    .padStart(2, '0');
const defaultTimestampFactory = () => Date.now();
export function generateSessionCodename(existing, options = {}) {
    const used = new Set(existing);
    const slugFactory = options.slugFactory ?? defaultSlugFactory;
    const saltFactory = options.saltFactory ?? defaultSaltFactory;
    const timestampFactory = options.timestampFactory ?? defaultTimestampFactory;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const candidate = ensureNonEmptyString(slugFactory(), 'slugFactory');
        if (!used.has(candidate)) {
            return candidate;
        }
    }
    const withSalt = `${ensureNonEmptyString(slugFactory(), 'slugFactory')}-${ensureNonEmptyString(saltFactory(), 'saltFactory')}`;
    if (!used.has(withSalt)) {
        return withSalt;
    }
    const timestamp = timestampFactory();
    if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) {
        throw new TypeError('timestampFactory must return a numeric timestamp');
    }
    return `${withSalt}-${Math.abs(timestamp).toString(36).slice(-2)}`;
}
//# sourceMappingURL=codename.js.map