type DomToImageModule = {
    toJpeg: (node: HTMLElement, options?: unknown) => Promise<string>;
};
export declare const recordScreenshotError: (kind: string, error: unknown) => void;
export declare function loadDomToImage(): Promise<DomToImageModule>;
export declare function patchHtml2canvasColorParser(html2canvasModule: typeof import('html2canvas')): void;
export declare function normalizeOklchColors(root: HTMLElement, contextDocument?: Document): () => void;
export {};
//# sourceMappingURL=utils.d.ts.map