---
summary: "Guidelines for using ArkRegex helpers across the SweetLink CLI"
---
# ArkRegex usage in SweetLink

SweetLink now relies on [ArkRegex](https://www.npmjs.com/package/arkregex) to build every reusable pattern. The library gives us typed capture groups, consistent escaping, and integrates with Biome's regex lint rules. This document explains how to use the helpers, how we share patterns, and the guardrails that keep the regex surface maintainable.

## Quick reference

```ts
import { regex } from 'arkregex';

// Prefer top-level constants. `String.raw` is only needed when the literal
// contains sequences such as `\n` or lots of double escaping.
export const HEX_CHAR_PATTERN = regex.as('[0-9a-f]', 'i');
```

* Use `regex.as()` for every literal. The helper enforces compile-time validation and returns a `RegExp` with the right flags.
* Define the pattern once at the module top level. Biome's `useTopLevelRegex` rule expects this and we avoid per-call allocations.
* Only reach for `String.raw` when the string contains escape-heavy content—otherwise a normal string literal is clearer.

## Shared helpers live in `src/util/regex.ts`

Common patterns (trailing slash cleanup, optional slash guards, leading slash normalization) are exported from [`src/util/regex.ts`](../src/util/regex.ts). When you need one of those behaviors:

```ts
import { TRAILING_SLASH_PATTERN } from '../util/regex.js';

const trimmed = path.replace(TRAILING_SLASH_PATTERN, '');
```

Add new shared helpers when you notice the same literal popping up in multiple files. Co-locating them keeps the lint sweep short and makes it obvious which patterns already exist.

## Migration checklist

1. **Inventory** the file with `rg "new RegExp"` and `rg "/[^\\]/"` to find inline literals.
2. **Extract** each literal to a top-level constant (ideally in `src/util/regex.ts` if it is reusable) expressed via `regex.as()`.
3. **Replace** the inline callsites with the constant.
4. **Run** `pnpm exec biome lint ./src ./shared/src ./daemon/src ./tests` and `pnpm test -- --reporter=basic` to prove the migration.

## Best practices

| Guideline | Rationale |
| --- | --- |
| Prefer `regex.as()` over `new RegExp()` everywhere | Keeps type safety and consistent escaping |
| Put constants near the top of the module | Biome enforces top-level regex declarations |
| Use `String.raw` only when you need to double-escape backslashes | Less visual noise for simple literals |
| Reuse helpers from `src/util/regex.ts` | Reduces duplication & makes audits easier |
| Document uncommentable patterns with a short comment | Future reviewers need to know why a pattern is complex |
| Keep capture group names consistent (`?<slug>`) when exposing data | Aligns with ArkRegex's typed capture results |

## Exception workflow

Occasionally we hit patterns that legitimately need inline construction (for example, user-provided fragments). In those cases:

1. Wrap the dynamic portion in a sanitized helper (e.g., slugify, escape RegExp characters) before passing it to `regex.as()`.
2. Add a comment explaining why the literal cannot be hoisted.
3. If Biome still complains, apply `// biome-ignore lint/performance/useTopLevelRegex` with the explanation on the preceding line.

## Future improvements

* Move the remaining ad-hoc patterns (e.g., auth cookie prefixes, CSS color checks) into `src/util/regex.ts` once more callers share them.
* Add dedicated unit tests for each helper in `src/util/__tests__/regex.test.ts` so we can lock down future changes.
* Track any outstanding literals in this doc (a simple checklist works) so the next sweep knows what is left.
