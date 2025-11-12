import { regex } from 'arkregex';
import { compact } from 'es-toolkit';
import { loadDomToImageFromScript } from '../dom-to-image-loader.js';
import { toError } from '../utils/errors.js';

type DomToImageModule = { toJpeg: (node: HTMLElement, options?: unknown) => Promise<string> };

let domToImagePromise: Promise<DomToImageModule> | null = null;
type PatchState = 'unpatched' | 'patched';

let html2canvasColorPatchState: PatchState = 'unpatched';
const patchedCssWindows = new WeakSet<Window>();
const browserWindow = (globalThis as { window?: Window | null }).window ?? null;

const SAFE_CSS_PROPERTY_PATTERN = regex.as('^[a-z-]+$', 'i');
const OKLCH_PATTERN = regex.as('okl(?:ab|ch)', 'i');
const WHITESPACE_SPLIT_PATTERN = regex.as(String.raw`\s+`);
const TRAILING_ZERO_PATTERN = regex.as(String.raw`\.0+$`);

const noop = () => {
  /* intentionally blank */
};

export const recordScreenshotError = (kind: string, error: unknown): void => {
  if (browserWindow === null) {
    return;
  }
  const clientWindow = browserWindow as Window & {
    __sweetlinkScreenshotErrors?: Record<string, string>;
  };
  clientWindow.__sweetlinkScreenshotErrors ??= {};
  clientWindow.__sweetlinkScreenshotErrors[kind] = toError(error).message;
};

type KnownCssProperty =
  | 'color'
  | 'background-color'
  | 'background'
  | 'background-image'
  | 'border-top-color'
  | 'border-right-color'
  | 'border-bottom-color'
  | 'border-left-color'
  | 'outline-color'
  | 'text-decoration-color'
  | 'box-shadow'
  | 'text-shadow'
  | 'column-rule-color'
  | 'caret-color'
  | 'fill'
  | 'stroke';

type CssPropertyName = KnownCssProperty | `--${string}`;

const isSafeCssProperty = (property: CssPropertyName): boolean => {
  const normalizedProperty: string = typeof property === 'string' ? property : String(property);
  return (
    SAFE_CSS_PROPERTY_PATTERN.test(normalizedProperty) ||
    String.prototype.startsWith.call(normalizedProperty, '--')
  );
};

export function loadDomToImage(): Promise<DomToImageModule> {
  if (domToImagePromise) {
    return domToImagePromise;
  }

  const resolveModule = async (): Promise<DomToImageModule> => {
    try {
      const loadedModule = await loadDomToImageFromScript();
      if (typeof loadedModule.toJpeg === 'function') {
        return loadedModule;
      }
    } catch (error) {
      recordScreenshotError('domToImage', error);
      console.warn('[SweetLink] Failed to load dom-to-image-more via script:', error);
    }

    const globalAny = browserWindow
      ? (browserWindow as Window & {
          domtoimage?: DomToImageModule;
          domToImage?: DomToImageModule;
          domtoImage?: DomToImageModule;
        })
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

export function patchHtml2canvasColorParser(html2canvasModule: typeof import('html2canvas')): void {
  if (html2canvasColorPatchState === 'patched') {
    return;
  }

  const moduleAny = html2canvasModule as {
    Color?: { parse?: (value: string) => unknown };
    default?: { Color?: { parse?: (value: string) => unknown } };
  };
  const colorApi = moduleAny.Color ?? moduleAny.default?.Color;
  if (!colorApi || typeof colorApi.parse !== 'function') {
    html2canvasColorPatchState = 'patched';
    return;
  }

  // html2canvas bails as soon as its colour parser sees OKLAB/OKLCH tokens. Wrap the parser and
  // re-run it against an sRGB-normalised string so the library never sees the unsupported syntax.
  const originalParse = colorApi.parse.bind(colorApi);
  colorApi.parse = (value: string) => {
    try {
      return originalParse(value);
    } catch (error) {
      const normalised = replaceOkColorFunctions(value);
      if (normalised && normalised !== value) {
        return originalParse(normalised);
      }
      throw error;
    }
  };

  html2canvasColorPatchState = 'patched';
}

function ensureCssGetPropertyValuePatched(contextWindow: Window): void {
  if (patchedCssWindows.has(contextWindow)) {
    return;
  }

  const cssDeclaration = (contextWindow as { CSSStyleDeclaration?: typeof CSSStyleDeclaration }).CSSStyleDeclaration;
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
  const callOriginalGetPropertyValue = (style: CSSStyleDeclaration, property: string): string =>
    proto.getPropertyValue.call(style, property);
  proto.getPropertyValue = function patchedGetPropertyValue(property: string): string {
    const value = callOriginalGetPropertyValue(this, property);
    const normalised = replaceOkColorFunctions(value);
    return normalised ?? value;
  };

  patchedCssWindows.add(contextWindow);
}

export function normalizeOklchColors(root: HTMLElement, contextDocument: Document = document): () => void {
  const contextWindow = contextDocument.defaultView ?? browserWindow;
  if (!contextWindow) {
    return noop;
  }
  ensureCssGetPropertyValuePatched(contextWindow);

  const rawBody = (contextDocument as unknown as { body?: HTMLElement | null }).body;
  const fallbackDocumentElement = contextDocument.documentElement;
  const fallbackBody = fallbackDocumentElement instanceof HTMLElement ? fallbackDocumentElement : null;
  const body = rawBody ?? fallbackBody;
  if (body === null) {
    return noop;
  }

  const properties: KnownCssProperty[] = [
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
  const elements: HTMLElement[] =
    root === documentElement
      ? [documentElement, ...contextDocument.querySelectorAll<HTMLElement>('*')]
      : [root, ...root.querySelectorAll<HTMLElement>('*')];

  const sandbox = contextDocument.createElement('span');
  sandbox.style.position = 'absolute';
  sandbox.style.visibility = 'hidden';
  sandbox.style.pointerEvents = 'none';
  sandbox.style.zIndex = '-1';
  body.append(sandbox);

  const revertStyles: Array<() => void> = [];

  for (const element of elements) {
    const computed = contextWindow.getComputedStyle(element);
    const customProperties: CssPropertyName[] = [];
    for (let index = 0; index < computed.length; index += 1) {
      const name = computed.item(index);
      if (name.startsWith('--')) {
        customProperties.push(name as CssPropertyName);
      }
    }
    for (const property of properties) {
      let currentValue = computed.getPropertyValue(property);
      if (!currentValue) {
        continue;
      }
      const lowerValue = currentValue.toLowerCase();
      if (!(lowerValue.includes('oklch') || lowerValue.includes('oklab'))) {
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
        } else {
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
          } else {
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

function replaceOkColorFunctions(input: string): string | null {
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
      } else if (char === ')') {
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
    } else {
      result += input.slice(nextIndex, end);
    }
    cursor = end;
  }

  let output = result;
  const colorMixPattern = regex.as(String.raw`color-mix\(\s*in\s+okl(?:ab|ch)`, 'gi');
  if (colorMixPattern.test(output)) {
    output = output.replaceAll(colorMixPattern, (segment) => segment.replace(OKLCH_PATTERN, 'srgb'));
    changed = true;
  }
  if (!changed || output === input) {
    return null;
  }
  return output;
}

function convertOklchToRgb(payload: string): string | null {
  const [colorPartRaw, alphaPartRaw] = payload.split('/');
  const colorPart = colorPartRaw?.trim() ?? '';
  if (!colorPart) {
    return null;
  }

  const components = compact(colorPart.split(WHITESPACE_SPLIT_PATTERN).map((token) => token.trim()));
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
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${alpha.toFixed(3).replace(TRAILING_ZERO_PATTERN, '')})`;
}

function convertOklabToRgb(payload: string): string | null {
  const [colorPartRaw, alphaPartRaw] = payload.split('/');
  const colorPart = colorPartRaw?.trim() ?? '';
  if (!colorPart) {
    return null;
  }

  const components = compact(colorPart.split(WHITESPACE_SPLIT_PATTERN).map((token) => token.trim()));
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
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${alpha.toFixed(3).replace(TRAILING_ZERO_PATTERN, '')})`;
}

function parseOklchComponent(value: string, options: { isPercentage?: boolean; clampZero?: boolean }): number | null {
  const trimmed = value.toLowerCase();
  let numeric: number;
  if (trimmed.endsWith('%')) {
    const parsed = Number.parseFloat(trimmed.slice(0, -1));
    if (Number.isNaN(parsed)) {
      return null;
    }
    numeric = parsed / 100;
  } else {
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

function parseOklabComponent(value: string): number | null {
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

function parseFloatOrNull(input: string): number | null {
  const parsed = Number.parseFloat(input);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseHueComponent(value: string): number | null {
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

function parseAlphaComponent(value: string): number | null {
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

function srgbChannelFromLinear(value: number): number {
  const clamped = clamp(value, 0, 1);
  if (clamped <= 0.003_130_8) {
    return Math.round(clamped * 12.92 * 255);
  }
  return Math.round((1.055 * clamped ** (1 / 2.4) - 0.055) * 255);
}

function oklchToSrgb(lightness: number, chroma: number, hueDegrees: number): { r: number; g: number; b: number } {
  const hRadians = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hRadians);
  const b = chroma * Math.sin(hRadians);

  const l_ = lightness + 0.396_337_777_4 * a + 0.215_803_757_3 * b;
  const m_ = lightness - 0.105_561_345_8 * a - 0.063_854_172_8 * b;
  const s_ = lightness - 0.089_484_177_5 * a - 1.291_485_548 * b;

  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;

  const rLinear = 4.076_741_662_1 * l3 - 3.307_711_591_3 * m3 + 0.230_969_929_2 * s3;
  const gLinear = -1.268_438_004_6 * l3 + 2.609_757_401_1 * m3 - 0.341_319_396_5 * s3;
  const bLinear = -0.004_196_086_3 * l3 - 0.703_418_614_7 * m3 + 1.707_614_701 * s3;

  return {
    r: srgbChannelFromLinear(rLinear),
    g: srgbChannelFromLinear(gLinear),
    b: srgbChannelFromLinear(bLinear),
  };
}

function oklabToSrgb(lightness: number, a: number, b: number): { r: number; g: number; b: number } {
  const l_ = lightness + 0.396_337_777_4 * a + 0.215_803_757_3 * b;
  const m_ = lightness - 0.105_561_345_8 * a - 0.063_854_172_8 * b;
  const s_ = lightness - 0.089_484_177_5 * a - 1.291_485_548 * b;

  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;

  const rLinear = 4.076_741_662_1 * l3 - 3.307_711_591_3 * m3 + 0.230_969_929_2 * s3;
  const gLinear = -1.268_438_004_6 * l3 + 2.609_757_401_1 * m3 - 0.341_319_396_5 * s3;
  const bLinear = -0.004_196_086_3 * l3 - 0.703_418_614_7 * m3 + 1.707_614_701 * s3;

  return {
    r: srgbChannelFromLinear(rLinear),
    g: srgbChannelFromLinear(gLinear),
    b: srgbChannelFromLinear(bLinear),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
