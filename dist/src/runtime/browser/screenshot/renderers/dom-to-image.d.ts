import type { SweetLinkScreenshotResultData } from '@sweetlink/shared';
export declare function captureWithDomToImage(targetInfo: {
    base: HTMLElement;
    target: HTMLElement;
    clip?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}, quality: number): Promise<SweetLinkScreenshotResultData>;
export declare function stripDataUrlPrefix(dataUrl: string): string;
//# sourceMappingURL=dom-to-image.d.ts.map