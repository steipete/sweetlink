import { createHookRunner } from "./screenshot/index.js";
import { stripDataUrlPrefix } from "./screenshot/renderers/dom-to-image.js";
import { commandSelectorSummary } from "./screenshot/targets.js";
import { type SweetLinkClient, type SweetLinkClientOptions } from "./types.js";
export declare function createSweetLinkClient(options?: SweetLinkClientOptions): SweetLinkClient;
export declare const sweetLinkBrowserTestHelpers: {
    createHookRunner: typeof createHookRunner;
    stripDataUrlPrefix: typeof stripDataUrlPrefix;
    commandSelectorSummary: typeof commandSelectorSummary;
};
//# sourceMappingURL=client.d.ts.map