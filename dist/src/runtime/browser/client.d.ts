import { stripDataUrlPrefix } from './screenshot/renderers/dom-to-image';
import { commandSelectorSummary } from './screenshot/targets';
import { type SweetLinkClient, type SweetLinkClientOptions } from './types';
export declare function createSweetLinkClient(options?: SweetLinkClientOptions): SweetLinkClient;
export declare const sweetLinkBrowserTestHelpers: {
    createHookRunner: (source: string) => (clientWindow: Window, document_: Document, target: HTMLElement) => Promise<void> | void;
    stripDataUrlPrefix: typeof stripDataUrlPrefix;
    commandSelectorSummary: typeof commandSelectorSummary;
};
//# sourceMappingURL=client.d.ts.map