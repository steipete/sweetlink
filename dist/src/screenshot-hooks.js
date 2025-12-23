export function buildScreenshotHooks(options) {
    const hooks = [];
    const selector = options.selector ?? undefined;
    const addHook = (hook) => {
        const key = JSON.stringify(hook);
        if (!hooks.some((existing) => JSON.stringify(existing) === key)) {
            hooks.push(hook);
        }
    };
    if (selector) {
        const scrollTarget = options.scrollSelector ?? selector;
        addHook({
            type: 'scrollIntoView',
            selector: scrollTarget,
            block: 'center',
        });
        const waitSelector = options.waitSelector ?? selector;
        const visibility = options.waitVisible === false ? 'any' : 'visible';
        addHook({
            type: 'waitForSelector',
            selector: waitSelector,
            visibility,
            timeoutMs: options.waitTimeout ?? 12_000,
        });
        addHook({ type: 'waitForIdle', frameCount: 2, timeoutMs: 4000 });
    }
    if (options.scrollIntoView || options.scrollSelector) {
        addHook({
            type: 'scrollIntoView',
            selector: options.scrollSelector ?? selector,
            block: 'center',
        });
    }
    if (options.waitSelector) {
        addHook({
            type: 'waitForSelector',
            selector: options.waitSelector,
            visibility: options.waitVisible === false ? 'any' : 'visible',
            timeoutMs: options.waitTimeout ?? 12_000,
        });
    }
    if (options.delayMs && Number.isFinite(options.delayMs) && options.delayMs > 0) {
        addHook({
            type: 'wait',
            ms: Math.max(0, Math.floor(options.delayMs)),
        });
    }
    else if (!selector) {
        addHook({ type: 'waitForIdle', frameCount: 1, timeoutMs: 2000 });
    }
    if (options.beforeScript) {
        addHook({ type: 'script', code: options.beforeScript });
    }
    return hooks;
}
//# sourceMappingURL=screenshot-hooks.js.map