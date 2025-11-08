import { regex } from 'arkregex';
import { compact } from 'es-toolkit';
import { loadDomToImageFromScript } from '../dom-to-image-loader';
import { toError } from '../utils/errors';
let domToImagePromise = null;
let html2canvasColorPatchState = 'unpatched';
const patchedCssWindows = new WeakSet();
const browserWindow = globalThis.window ?? null;
export const recordScreenshotError = (kind, error) => {
    if (browserWindow === null) {
        return;
    }
    const clientWindow = browserWindow;
    clientWindow.__sweetlinkScreenshotErrors ?? (clientWindow.__sweetlinkScreenshotErrors = {});
    clientWindow.__sweetlinkScreenshotErrors[kind] = toError(error).message;
};
const isSafeCssProperty = (property) => /^[a-z-]+$/i.test(property) || property.startsWith('--');
export async function loadDomToImage() {
    if (domToImagePromise) {
        return domToImagePromise;
    }
    const resolveModule = async () => {
        try {
            const loadedModule = await loadDomToImageFromScript();
            if (typeof loadedModule.toJpeg === 'function') {
                return loadedModule;
            }
        }
        catch (error) {
            recordScreenshotError('domToImage', error);
            console.warn('[SweetLink] Failed to load dom-to-image-more via script:', error);
        }
        const globalAny = browserWindow
            ? browserWindow
            : null;
        const fallback = globalAny?.domToImage ?? globalAny?.domtoimage ?? globalAny?.domtoImage;
        if (fallback && typeof fallback.toJpeg === 'function') {
            return fallback;
        }
        throw new Error('dom-to-image-more is unavailable; ensure it is installed or exposed globally as domtoimage');
    };
    domToImagePromise = resolveModule();
    return domToImagePromise;
}
export function patchHtml2canvasColorParser(html2canvasModule) {
    if (html2canvasColorPatchState === 'patched') {
        return;
    }
    const moduleAny = html2canvasModule;
    const colorApi = moduleAny.Color ?? moduleAny.default?.Color;
    if (!colorApi || typeof colorApi.parse !== 'function') {
        html2canvasColorPatchState = 'patched';
        return;
    }
    // html2canvas bails as soon as its colour parser sees OKLAB/OKLCH tokens. Wrap the parser and
    // re-run it against an sRGB-normalised string so the library never sees the unsupported syntax.
    const originalParse = colorApi.parse.bind(colorApi);
    colorApi.parse = (value) => {
        try {
            return originalParse(value);
        }
        catch (error) {
            const normalised = replaceOkColorFunctions(value);
            if (normalised && normalised !== value) {
                return originalParse(normalised);
            }
            throw error;
        }
    };
    html2canvasColorPatchState = 'patched';
}
function ensureCssGetPropertyValuePatched(contextWindow) {
    if (patchedCssWindows.has(contextWindow)) {
        return;
    }
    const cssDeclaration = contextWindow.CSSStyleDeclaration;
    if (!cssDeclaration) {
        patchedCssWindows.add(contextWindow);
        return;
    }
    const proto = cssDeclaration.prototype;
    if (typeof proto.getPropertyValue !== 'function') {
        patchedCssWindows.add(contextWindow);
        return;
    }
    // Computed styles can still expose OKLAB values even after inline overrides. Monkey-patch
    // getPropertyValue so every lookup feeds through the same normalisation pipeline.
    const callOriginalGetPropertyValue = (style, property) => proto.getPropertyValue.call(style, property);
    proto.getPropertyValue = function patchedGetPropertyValue(property) {
        const value = callOriginalGetPropertyValue(this, property);
        const normalised = replaceOkColorFunctions(value);
        return normalised ?? value;
    };
    patchedCssWindows.add(contextWindow);
}
export function normalizeOklchColors(root, contextDocument = document) {
    const contextWindow = contextDocument.defaultView ?? browserWindow;
    if (!contextWindow) {
        return () => { };
    }
    ensureCssGetPropertyValuePatched(contextWindow);
    const rawBody = contextDocument.body;
    const fallbackDocumentElement = contextDocument.documentElement;
    const fallbackBody = fallbackDocumentElement instanceof HTMLElement ? fallbackDocumentElement : null;
    const body = rawBody ?? fallbackBody;
    if (body === null) {
        return () => { };
    }
    const properties = [
        'color',
        'background-color',
        'background',
        'background-image',
        'border-top-color',
        'border-right-color',
        'border-bottom-color',
        'border-left-color',
        'outline-color',
        'text-decoration-color',
        'box-shadow',
        'text-shadow',
        'column-rule-color',
        'caret-color',
        'fill',
        'stroke',
    ];
    const documentElement = contextDocument.documentElement;
    const elements = root === documentElement
        ? [documentElement, ...contextDocument.querySelectorAll('*')]
        : [root, ...root.querySelectorAll('*')];
    const sandbox = contextDocument.createElement('span');
    sandbox.style.position = 'absolute';
    sandbox.style.visibility = 'hidden';
    sandbox.style.pointerEvents = 'none';
    sandbox.style.zIndex = '-1';
    body.append(sandbox);
    const revertStyles = [];
    for (const element of elements) {
        const computed = contextWindow.getComputedStyle(element);
        const customProperties = [];
        for (let index = 0; index < computed.length; index += 1) {
            const name = computed.item(index);
            if (name.startsWith('--')) {
                customProperties.push(name);
            }
        }
        for (const property of properties) {
            let currentValue = computed.getPropertyValue(property);
            if (!currentValue) {
                continue;
            }
            const lowerValue = currentValue.toLowerCase();
            if (!lowerValue.includes('oklch') && !lowerValue.includes('oklab')) {
                continue;
            }
            const converted = replaceOkColorFunctions(currentValue);
            if (converted) {
                currentValue = converted;
            }
            sandbox.style.removeProperty(property);
            sandbox.style.setProperty(property, currentValue);
            const resolved = contextWindow.getComputedStyle(sandbox).getPropertyValue(property);
            sandbox.style.removeProperty(property);
            if (!resolved) {
                continue;
            }
            const resolvedLower = resolved.toLowerCase();
            if (resolvedLower.includes('oklch') || resolvedLower.includes('oklab')) {
                continue;
            }
            const inlineValue = element.style.getPropertyValue(property);
            const inlinePriority = element.style.getPropertyPriority(property);
            if (inlineValue === resolved && inlinePriority === element.style.getPropertyPriority(property)) {
                continue;
            }
            revertStyles.push(() => {
                if (inlineValue) {
                    element.style.setProperty(property, inlineValue, inlinePriority || undefined);
                }
                else {
                    element.style.removeProperty(property);
                }
            });
            element.style.setProperty(property, resolved, inlinePriority || undefined);
        }
        for (const customName of customProperties) {
            if (!isSafeCssProperty(customName)) {
                continue;
            }
            const value = computed.getPropertyValue(customName);
            if (!value) {
                continue;
            }
            const normalized = replaceOkColorFunctions(value.trim());
            if (normalized) {
                const previousValue = element.style.getPropertyValue(customName);
                const previousPriority = element.style.getPropertyPriority(customName);
                revertStyles.push(() => {
                    if (previousValue) {
                        element.style.setProperty(customName, previousValue, previousPriority || undefined);
                    }
                    else {
                        element.style.removeProperty(customName);
                    }
                });
                element.style.setProperty(customName, normalized);
            }
        }
    }
    sandbox.remove();
    return () => {
        for (const revert of revertStyles) {
            revert();
        }
    };
}
function replaceOkColorFunctions(input) {
    let result = '';
    let cursor = 0;
    let changed = false;
    const lower = input.toLowerCase();
    while (cursor < input.length) {
        const nextIndex = (() => {
            const oklchIndex = lower.indexOf('oklch(', cursor);
            const oklabIndex = lower.indexOf('oklab(', cursor);
            if (oklchIndex === -1) {
                return oklabIndex;
            }
            if (oklabIndex === -1) {
                return oklchIndex;
            }
            return Math.min(oklchIndex, oklabIndex);
        })();
        if (nextIndex === -1) {
            result += input.slice(cursor);
            break;
        }
        const token = lower.startsWith('oklch(', nextIndex) ? 'oklch' : 'oklab';
        const openIndex = nextIndex + token.length;
        result += input.slice(cursor, nextIndex);
        let end = openIndex + 1;
        let depth = 1;
        while (end < input.length && depth > 0) {
            const char = input.charAt(end);
            if (char === '(') {
                depth += 1;
            }
            else if (char === ')') {
                depth -= 1;
            }
            end += 1;
        }
        if (depth !== 0) {
            return null;
        }
        const inside = input.slice(openIndex + 1, end - 1);
        const replacement = token === 'oklch' ? convertOklchToRgb(inside) : convertOklabToRgb(inside);
        if (replacement) {
            result += replacement;
            changed = true;
        }
        else {
            result += input.slice(nextIndex, end);
        }
        cursor = end;
    }
    let output = result;
    const colorMixPattern = regex.as(String.raw `color-mix\(\s*in\s+okl(?:ab|ch)`, 'gi');
    if (colorMixPattern.test(output)) {
        output = output.replaceAll(colorMixPattern, (segment) => segment.replace(/okl(?:ab|ch)/i, 'srgb'));
        changed = true;
    }
    if (!changed || output === input) {
        return null;
    }
    return output;
}
function convertOklchToRgb(payload) {
    const [colorPartRaw, alphaPartRaw] = payload.split('/');
    const colorPart = colorPartRaw?.trim() ?? '';
    if (!colorPart) {
        return null;
    }
    const components = compact(colorPart.split(/\s+/).map((token) => token.trim()));
    if (components.length < 3) {
        return null;
    }
    const [lightnessToken = '', chromaToken = '', hueToken = ''] = components;
    const lightness = parseOklchComponent(lightnessToken, { isPercentage: true });
    const chroma = parseOklchComponent(chromaToken, { clampZero: true });
    const hue = parseHueComponent(hueToken);
    if (lightness === null || chroma === null || hue === null) {
        return null;
    }
    const alpha = alphaPartRaw ? parseAlphaComponent(alphaPartRaw) : 1;
    if (alpha === null) {
        return null;
    }
    const { r, g, b } = oklchToSrgb(lightness, chroma, hue);
    if (alpha >= 0.999) {
        return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
    }
    return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${alpha.toFixed(3).replace(/\.0+$/, '')})`;
}
function convertOklabToRgb(payload) {
    const [colorPartRaw, alphaPartRaw] = payload.split('/');
    const colorPart = colorPartRaw?.trim() ?? '';
    if (!colorPart) {
        return null;
    }
    const components = compact(colorPart.split(/\s+/).map((token) => token.trim()));
    if (components.length < 3) {
        return null;
    }
    const [lightnessToken = '', aToken = '', bToken = ''] = components;
    const lightness = parseOklchComponent(lightnessToken, { isPercentage: true });
    const aComponent = parseOklabComponent(aToken);
    const bComponent = parseOklabComponent(bToken);
    if (lightness === null || aComponent === null || bComponent === null) {
        return null;
    }
    const alpha = alphaPartRaw ? parseAlphaComponent(alphaPartRaw) : 1;
    if (alpha === null) {
        return null;
    }
    const { r, g, b } = oklabToSrgb(lightness, aComponent, bComponent);
    if (alpha >= 0.999) {
        return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
    }
    return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${alpha.toFixed(3).replace(/\.0+$/, '')})`;
}
function parseOklchComponent(value, options) {
    const trimmed = value.toLowerCase();
    let numeric;
    if (trimmed.endsWith('%')) {
        const parsed = Number.parseFloat(trimmed.slice(0, -1));
        if (Number.isNaN(parsed)) {
            return null;
        }
        numeric = parsed / 100;
    }
    else {
        const parsed = Number.parseFloat(trimmed);
        if (Number.isNaN(parsed)) {
            return null;
        }
        numeric = parsed;
    }
    if (options.isPercentage) {
        return clamp(numeric, 0, 1);
    }
    if (options.clampZero) {
        return Math.max(0, numeric);
    }
    return numeric;
}
function parseOklabComponent(value) {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
        return null;
    }
    if (trimmed.endsWith('%')) {
        const parsed = Number.parseFloat(trimmed.slice(0, -1));
        if (Number.isNaN(parsed)) {
            return null;
        }
        return parsed / 100;
    }
    const parsed = Number.parseFloat(trimmed);
    if (Number.isNaN(parsed)) {
        return null;
    }
    return parsed;
}
function parseFloatOrNull(input) {
    const parsed = Number.parseFloat(input);
    return Number.isNaN(parsed) ? null : parsed;
}
function parseHueComponent(value) {
    const trimmed = value.trim().toLowerCase();
    if (trimmed.endsWith('deg')) {
        const parsed = parseFloatOrNull(trimmed.slice(0, -3));
        return parsed === null ? null : parsed;
    }
    if (trimmed.endsWith('grad')) {
        const parsed = parseFloatOrNull(trimmed.slice(0, -4));
        return parsed === null ? null : parsed * (9 / 10);
    }
    if (trimmed.endsWith('rad')) {
        const parsed = parseFloatOrNull(trimmed.slice(0, -3));
        return parsed === null ? null : (parsed * 180) / Math.PI;
    }
    if (trimmed.endsWith('turn')) {
        const parsed = parseFloatOrNull(trimmed.slice(0, -4));
        return parsed === null ? null : parsed * 360;
    }
    const parsed = parseFloatOrNull(trimmed);
    return parsed === null ? null : parsed;
}
function parseAlphaComponent(value) {
    const trimmed = value.trim();
    if (trimmed.endsWith('%')) {
        const parsed = Number.parseFloat(trimmed.slice(0, -1));
        if (Number.isNaN(parsed)) {
            return null;
        }
        return clamp(parsed / 100, 0, 1);
    }
    const parsed = Number.parseFloat(trimmed);
    if (Number.isNaN(parsed)) {
        return null;
    }
    return clamp(parsed, 0, 1);
}
function srgbChannelFromLinear(value) {
    const clamped = clamp(value, 0, 1);
    if (clamped <= 0.0031308) {
        return Math.round(clamped * 12.92 * 255);
    }
    return Math.round((1.055 * clamped ** (1 / 2.4) - 0.055) * 255);
}
function oklchToSrgb(lightness, chroma, hueDegrees) {
    const hRadians = (hueDegrees * Math.PI) / 180;
    const a = chroma * Math.cos(hRadians);
    const b = chroma * Math.sin(hRadians);
    const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = lightness - 0.0894841775 * a - 1.291485548 * b;
    const l3 = l_ ** 3;
    const m3 = m_ ** 3;
    const s3 = s_ ** 3;
    const rLinear = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
    const gLinear = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
    const bLinear = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
    return {
        r: srgbChannelFromLinear(rLinear),
        g: srgbChannelFromLinear(gLinear),
        b: srgbChannelFromLinear(bLinear),
    };
}
function oklabToSrgb(lightness, a, b) {
    const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = lightness - 0.0894841775 * a - 1.291485548 * b;
    const l3 = l_ ** 3;
    const m3 = m_ ** 3;
    const s3 = s_ ** 3;
    const rLinear = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
    const gLinear = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
    const bLinear = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
    return {
        r: srgbChannelFromLinear(rLinear),
        g: srgbChannelFromLinear(gLinear),
        b: srgbChannelFromLinear(bLinear),
    };
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
//# sourceMappingURL=utils.js.map