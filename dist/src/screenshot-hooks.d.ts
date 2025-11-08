import type { SweetLinkScreenshotHook } from '../shared/src/index.js';
export interface BuildScreenshotHooksOptions {
    readonly selector: string | null;
    readonly scrollIntoView: boolean;
    readonly scrollSelector?: string;
    readonly waitSelector?: string;
    readonly waitVisible?: boolean;
    readonly waitTimeout?: number;
    readonly delayMs?: number;
    readonly beforeScript?: string;
}
export declare function buildScreenshotHooks(options: BuildScreenshotHooksOptions): SweetLinkScreenshotHook[];
//# sourceMappingURL=screenshot-hooks.d.ts.map