const cssGlobal = globalThis.CSS;
const cssEscapeFunction = cssGlobal && typeof cssGlobal.escape === 'function' ? cssGlobal.escape.bind(cssGlobal) : null;
export function discoverSelectorCandidates(options) {
    if (typeof document === 'undefined') {
        return [];
    }
    const { scopeSelector, includeHidden } = options;
    const limit = Number.isFinite(options.limit) && options.limit ? Math.max(1, Math.floor(options.limit)) : 25;
    const root = resolveDiscoveryRoot(scopeSelector);
    if (!root) {
        return [];
    }
    const candidates = collectCandidateShapes(root);
    const deduped = deduplicateCandidates(candidates);
    const mapped = deduped
        .map((shape) => {
        const { element, hook, baseScore, selector } = shape;
        const rect = element.getBoundingClientRect();
        const computed = getComputedStyle(element);
        const visible = isVisible(rect, computed);
        if (!includeHidden && !visible) {
            return null;
        }
        const snippet = createTextSnippet(element);
        const normalizedSnippet = snippet ?? '';
        const dataTarget = element.dataset.sweetlinkTarget ?? null;
        const dataTestId = element.dataset.testid ?? null;
        const result = {
            selector,
            hook,
            tagName: element.tagName.toLowerCase(),
            textSnippet: normalizedSnippet,
            score: calculateScore(baseScore, snippet, visible),
            visible,
            size: {
                width: Math.round(rect.width),
                height: Math.round(rect.height),
            },
            position: {
                top: Math.round(rect.top + window.scrollY),
                left: Math.round(rect.left + window.scrollX),
            },
            dataTarget,
            dataTestId,
            id: element.id || null,
            path: buildDomPath(element),
        };
        return result;
    })
        .filter((candidate) => candidate !== null);
    mapped.sort((a, b) => {
        if (b.score === a.score) {
            return a.selector.localeCompare(b.selector);
        }
        return b.score - a.score;
    });
    return mapped.slice(0, limit);
}
function resolveDiscoveryRoot(scopeSelector) {
    if (scopeSelector) {
        const scoped = document.querySelector(scopeSelector);
        if (scoped && scoped instanceof HTMLElement) {
            return scoped;
        }
    }
    const main = document.querySelector('main');
    if (main) {
        return main;
    }
    const rawBody = document.body;
    return rawBody ?? document.documentElement;
}
function collectCandidateShapes(root) {
    const seen = new Set();
    const shapes = [];
    const push = (element, hook, baseScore, selector) => {
        if (seen.has(element)) {
            const existing = shapes.find((entry) => entry.element === element);
            if (existing && baseScore > existing.baseScore) {
                existing.baseScore = baseScore;
                existing.hook = hook;
                existing.selector = selector;
            }
            return;
        }
        seen.add(element);
        shapes.push({ element, hook, baseScore, selector });
    };
    for (const element of root.querySelectorAll('[data-sweetlink-target]')) {
        const target = element.dataset.sweetlinkTarget;
        if (target) {
            const selector = `[data-sweetlink-target="${escapeCss(target)}"]`;
            push(element, 'data-target', 100, selector);
        }
    }
    for (const element of root.querySelectorAll('[id]')) {
        if (!element.id) {
            continue;
        }
        const selector = `#${escapeCss(element.id)}`;
        push(element, 'id', 85, selector);
    }
    for (const element of root.querySelectorAll('[role="region"], [role="article"], [role="group"], [aria-label]')) {
        const aria = element.getAttribute('aria-label');
        const hook = aria ? 'aria' : 'role';
        const selector = createStructuralSelector(element);
        push(element, hook, 70, selector);
    }
    const structuralSelector = 'main > section, main > article, main > div, main > aside, main > header, main > footer, [data-dashboard-card], [data-card], [data-testid*="card" i]';
    for (const element of root.querySelectorAll(structuralSelector)) {
        const selector = createStructuralSelector(element);
        push(element, 'structure', 55, selector);
    }
    if (root instanceof HTMLElement) {
        push(root, Object.hasOwn(root.dataset, 'sweetlinkTarget') ? 'data-target' : 'structure', 50, createStructuralSelector(root));
    }
    return shapes;
}
function deduplicateCandidates(candidates) {
    const bySelector = new Map();
    for (const candidate of candidates) {
        const existing = bySelector.get(candidate.selector);
        if (!existing || candidate.baseScore > existing.baseScore) {
            bySelector.set(candidate.selector, candidate);
        }
    }
    return [...bySelector.values()];
}
function escapeCss(value) {
    if (cssEscapeFunction) {
        return cssEscapeFunction(value);
    }
    return value.replaceAll(/[^a-zA-Z0-9_-]/g, (char) => {
        const codePoint = char.codePointAt(0);
        if (codePoint === undefined) {
            return '';
        }
        return `\\${codePoint.toString(16)} `;
    });
}
function createStructuralSelector(element) {
    const segments = [];
    const documentBody = document.body ?? null;
    const documentElement = document.documentElement instanceof HTMLElement ? document.documentElement : null;
    const visit = (currentElement, depth) => {
        if (depth >= 8) {
            return;
        }
        if (documentBody !== null && currentElement === documentBody) {
            return;
        }
        if (documentElement !== null && currentElement === documentElement) {
            return;
        }
        const tag = currentElement.tagName.toLowerCase();
        const siblings = currentElement.parentElement?.children ?? [];
        let index = 0;
        for (const sibling of siblings) {
            if (sibling === currentElement) {
                break;
            }
            if (sibling instanceof HTMLElement && sibling.tagName.toLowerCase() === tag) {
                index += 1;
            }
        }
        const nth = index > 0 ? `:nth-of-type(${index + 1})` : '';
        segments.unshift(`${tag}${nth}`);
        if (currentElement.parentElement) {
            visit(currentElement.parentElement, depth + 1);
        }
    };
    visit(element, 0);
    return segments.join(' > ');
}
function calculateScore(base, snippet, visible) {
    let score = base;
    if (visible) {
        score += 10;
    }
    if (snippet && snippet.length > 0) {
        score += Math.min(20, snippet.length / 2);
    }
    return score;
}
function createTextSnippet(element) {
    const text = element.innerText ?? element.textContent ?? '';
    const trimmed = text.trim().replaceAll(/\s+/g, ' ');
    if (!trimmed) {
        return null;
    }
    if (trimmed.length <= 60) {
        return trimmed;
    }
    return `${trimmed.slice(0, 57)}…`;
}
function isVisible(rect, computed) {
    if (rect.width <= 1 || rect.height <= 1) {
        return false;
    }
    if (computed.visibility === 'hidden' || computed.display === 'none' || Number.parseFloat(computed.opacity) < 0.05) {
        return false;
    }
    return true;
}
function buildDomPath(element) {
    const segments = [];
    let current = element;
    while (current) {
        const id = current.id ? `#${current.id}` : '';
        const classes = current.classList.length > 0
            ? `.${[...current.classList].map((className) => className.replaceAll(/\s+/g, '-')).join('.')}`
            : '';
        segments.unshift(`${current.tagName.toLowerCase()}${id}${classes}`.trim());
        current = current.parentElement;
    }
    return segments.join(' > ');
}
//# sourceMappingURL=selector-discovery.js.map