import { stripDataUrlPrefix } from './screenshot/renderers/dom-to-image.js';
import { commandSelectorSummary } from './screenshot/targets.js';
import { type SweetLinkClient, type SweetLinkClientOptions } from './types.js';
export declare function createSweetLinkClient(options?: SweetLinkClientOptions): SweetLinkClient;
export declare const sweetLinkBrowserTestHelpers: {
    createHookRunner: (source: string) => (clientWindow: Window, document_: Document, target: HTMLElement) => Promise<void> | void;
    stripDataUrlPrefix: typeof stripDataUrlPrefix;
    commandSelectorSummary: typeof commandSelectorSummary;
};
//# sourceMappingURL=client.d.ts.map