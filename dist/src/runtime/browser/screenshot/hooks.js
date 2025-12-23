import { z } from 'zod';
import { loadDefaultExportFromUrl } from '../module-loader.js';
import { getBrowserWindow } from '../utils/environment.js';
import { clamp } from '../utils/number.js';
import { isRecord, toTrimmedNonEmptyString } from '../utils/object.js';
const scrollIntoViewHookSchema = z
    .object({
    type: z.literal('scrollIntoView'),
    selector: z.union([z.string(), z.null()]).optional(),
    behavior: z.enum(['auto', 'smooth', 'instant']).optional(),
    block: z.enum(['start', 'center', 'end', 'nearest']).optional(),
})
    .passthrough();
const waitForSelectorHookSchema = z
    .object({
    type: z.literal('waitForSelector'),
    selector: z.string().min(1),
    visibility: z.enum(['any', 'visible']).optional(),
    timeoutMs: z.number().finite().optional(),
})
    .passthrough();
const waitForIdleHookSchema = z
    .object({
    type: z.literal('waitForIdle'),
    timeoutMs: z.number().finite().optional(),
    frameCount: z.number().finite().optional(),
})
    .passthrough();
const waitHookSchema = z
    .object({
    type: z.literal('wait'),
    ms: z.number().finite(),
})
    .passthrough();
const scriptHookSchema = z
    .object({
    type: z.literal('script'),
    code: z.string().min(1),
})
    .passthrough();
export const screenshotHookSchema = z.discriminatedUnion('type', [
    scrollIntoViewHookSchema,
    waitForSelectorHookSchema,
    waitForIdleHookSchema,
    waitHookSchema,
    scriptHookSchema,
]);
export const createHookRunner = (source) => {
    const blob = new Blob(['"use strict"; export default async (window, document, target) => {\n', source, '\n};'], {
        type: 'text/javascript',
    });
    const blobUrl = URL.createObjectURL(blob);
    let compiledRunnerPromise = null;
    const loadRunner = () => {
        if (!compiledRunnerPromise) {
            compiledRunnerPromise = loadDefaultExportFromUrl(blobUrl)
                .catch((error) => {
                throw error instanceof Error ? error : new Error(String(error));
            })
                .finally(() => {
                URL.revokeObjectURL(blobUrl);
            });
        }
        return compiledRunnerPromise;
    };
    return async (clientWindow, document_, target) => {
        const runner = await loadRunner();
        await runner(clientWindow, document_, target);
    };
};
const isPromiseLike = (value) => {
    if (!isRecord(value)) {
        return false;
    }
    return typeof value.then === 'function';
};
export async function applyScreenshotPreHooks(command, initialTarget) {
    const hooks = parseScreenshotHooks(command.hooks);
    if (hooks.length === 0) {
        return;
    }
    const runHook = async (hook) => {
        switch (hook.type) {
            case 'scrollIntoView': {
                const target = resolveHookTarget(hook.selector, command.selector, initialTarget.target);
                target.scrollIntoView({
                    behavior: hook.behavior ?? 'auto',
                    block: hook.block ?? 'center',
                });
                await waitForIdle({ frameCount: 1, timeoutMs: 2000 });
                return;
            }
            case 'waitForSelector': {
                await waitForSelectorHook(hook.selector, {
                    visibility: hook.visibility ?? 'any',
                    timeoutMs: hook.timeoutMs ?? 10_000,
                });
                return;
            }
            case 'waitForIdle': {
                await waitForIdle({
                    frameCount: hook.frameCount ?? 1,
                    timeoutMs: hook.timeoutMs ?? 3000,
                });
                return;
            }
            case 'wait': {
                await delay(Math.max(0, hook.ms));
                return;
            }
            case 'script': {
                await runHookScript(hook.code, initialTarget.target);
                return;
            }
            default: {
                /* ignore unsupported hook */
                return;
            }
        }
    };
    let hookChain = Promise.resolve();
    for (const hook of hooks) {
        hookChain = hookChain.then(() => runHook(hook));
    }
    await hookChain;
}
function parseScreenshotHooks(candidate) {
    if (!Array.isArray(candidate)) {
        return [];
    }
    const parsed = [];
    for (const hook of candidate) {
        const result = screenshotHookSchema.safeParse(hook);
        if (result.success) {
            parsed.push(result.data);
        }
    }
    return parsed;
}
function resolveHookTarget(hookSelector, commandSelector, fallback) {
    const selector = hookSelector ?? commandSelector ?? null;
    if (!selector) {
        return fallback;
    }
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`Pre-capture hook target not found for selector "${selector}"`);
    }
    if (!(element instanceof HTMLElement)) {
        throw new TypeError(`Pre-capture hook selector "${selector}" did not resolve to an HTMLElement`);
    }
    return element;
}
function waitForSelectorHook(selector, options) {
    const deadline = performance.now() + options.timeoutMs;
    const poll = async () => {
        const match = document.querySelector(selector);
        if (match instanceof HTMLElement) {
            if (options.visibility === 'visible') {
                const rect = match.getBoundingClientRect();
                const style = getComputedStyle(match);
                if (rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none') {
                    return match;
                }
            }
            else {
                return match;
            }
        }
        if (performance.now() > deadline) {
            throw new Error(`Timeout waiting for selector "${selector}" (${options.visibility})`);
        }
        await waitForAnimationFrame();
        return poll();
    };
    return poll();
}
async function waitForIdle(options) {
    const deadline = performance.now() + options.timeoutMs;
    const waitFrames = async (remaining) => {
        if (remaining <= 0) {
            return;
        }
        await waitForAnimationFrame();
        if (performance.now() > deadline) {
            console.warn('[SweetLink] waitForIdle timed out before reaching the requested frame count; proceeding with current frame.');
            return;
        }
        await waitFrames(remaining - 1);
    };
    await waitFrames(Math.max(1, options.frameCount));
}
function waitForAnimationFrame() {
    return new Promise((resolve) => {
        const browserWindow = getBrowserWindow();
        if (!browserWindow || typeof browserWindow.requestAnimationFrame !== 'function') {
            setTimeout(() => {
                resolve();
            }, 16);
            return;
        }
        browserWindow.requestAnimationFrame(() => {
            resolve();
        });
    });
}
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, clamp(ms, 0, Number.POSITIVE_INFINITY)));
async function runHookScript(code, target) {
    const normalizedCode = toTrimmedNonEmptyString(code);
    if (!normalizedCode) {
        return;
    }
    const runner = createHookRunner(normalizedCode);
    const result = runner(getBrowserWindow() ?? window, document, target);
    if (isPromiseLike(result)) {
        await result;
    }
}
//# sourceMappingURL=hooks.js.map