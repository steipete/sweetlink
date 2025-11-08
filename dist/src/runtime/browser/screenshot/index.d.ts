import type { SweetLinkScreenshotHooks } from '../types.js';
import { stripDataUrlPrefix } from './renderers/dom-to-image.js';
export declare function createScreenshotHooks(): SweetLinkScreenshotHooks & {
    readonly testHelpers: {
        stripDataUrlPrefix: typeof stripDataUrlPrefix;
    };
};
export { createHookRunner } from './hooks.js';
//# sourceMappingURL=index.d.ts.map