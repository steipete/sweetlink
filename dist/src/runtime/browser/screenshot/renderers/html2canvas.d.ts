import type { SweetLinkScreenshotResultData } from '@sweetlink/shared';
export declare function captureWithHtml2Canvas(targetInfo: {
    base: HTMLElement;
    target: HTMLElement;
    clip?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}, quality: number): Promise<SweetLinkScreenshotResultData>;
//# sourceMappingURL=html2canvas.d.ts.map