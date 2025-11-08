export const HTML2CANVAS_TARGET_ATTR = 'data-sweetlink-html2canvas-target';
export function resolveScreenshotTarget(command) {
    if (command.mode === 'element') {
        const selector = command.selector?.trim();
        if (!selector) {
            throw new Error('Screenshot selector is required for element mode');
        }
        const directMatch = document.querySelector(selector);
        const dataHookMatch = !directMatch && selector.startsWith('#')
            ? document.querySelector(`[data-sweetlink-target="${selector.slice(1)}"]`)
            : null;
        const element = directMatch ?? dataHookMatch;
        if (!element) {
            throw new Error(`Element not found for selector "${selector}"\n` +
                'Tips:\n' +
                ' • Ensure the target section is mounted and visible (expand menus or switch tabs if needed).\n' +
                ' • Add a stable hook such as data-sweetlink-target="analytics-card" or an id, then reference it directly.\n' +
                ' • If the layout shifts on smaller widths, widen the window (>= 1280px) so the card renders in the DOM.\n' +
                ' • As a last resort, re-run with --method puppeteer after opening a controlled Chrome window.');
        }
        if (!(element instanceof HTMLElement)) {
            throw new TypeError(`Element for selector "${selector}" is not an HTMLElement; SweetLink's html2canvas renderer only supports HTMLElement targets.`);
        }
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            throw new Error(`Element for selector "${selector}" has zero size. Try scrolling it into view or ensuring it is not hidden by responsive layout.`);
        }
        return {
            base: element,
            target: element,
        };
    }
    return { base: document.documentElement, target: document.documentElement };
}
export function commandSelectorSummary(element) {
    const parts = [];
    if (element.id) {
        parts.push(`#${element.id}`);
    }
    const testId = element.dataset.testid;
    if (testId) {
        parts.push(`[data-testid="${testId}"]`);
    }
    const dataTarget = element.dataset.sweetlinkTarget;
    if (dataTarget) {
        parts.push(`[data-sweetlink-target="${dataTarget}"]`);
    }
    if (parts.length > 0) {
        return parts.join(' ');
    }
    return element.tagName.toLowerCase();
}
//# sourceMappingURL=targets.js.map