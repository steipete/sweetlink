import type { SweetLinkScreenshotHooks } from '../types';
import { stripDataUrlPrefix } from './renderers/dom-to-image';
export declare function createScreenshotHooks(): SweetLinkScreenshotHooks & {
    readonly testHelpers: {
        stripDataUrlPrefix: typeof stripDataUrlPrefix;
    };
};
export { createHookRunner } from './hooks';
//# sourceMappingURL=index.d.ts.map