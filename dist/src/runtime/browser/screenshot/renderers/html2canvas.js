import { getBrowserWindow } from '../../utils/environment';
import { commandSelectorSummary, HTML2CANVAS_TARGET_ATTR } from '../targets';
import { normalizeOklchColors, patchHtml2canvasColorParser, recordScreenshotError } from '../utils';
let html2canvasModulePromise = null;
async function loadHtml2Canvas() {
    if (!html2canvasModulePromise) {
        html2canvasModulePromise = import('html2canvas');
    }
    const html2canvasModule = await html2canvasModulePromise;
    patchHtml2canvasColorParser(html2canvasModule);
    return html2canvasModule.default;
}
export async function captureWithHtml2Canvas(targetInfo, quality) {
    const browserWindow = getBrowserWindow();
    const restoreColors = normalizeOklchColors(targetInfo.base);
    const markerValue = `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
    const markerAssigned = !targetInfo.base.hasAttribute(HTML2CANVAS_TARGET_ATTR);
    if (markerAssigned) {
        targetInfo.base.setAttribute(HTML2CANVAS_TARGET_ATTR, markerValue);
    }
    const html2canvas = await loadHtml2Canvas();
    if (typeof html2canvas !== 'function') {
        restoreColors();
        throw new TypeError('html2canvas is unavailable');
    }
    const timeoutMs = 6000;
    let canvasResult;
    let timer;
    try {
        console.info('[SweetLink] html2canvas capture starting', {
            selector: commandSelectorSummary(targetInfo.target),
            clip: targetInfo.clip ?? null,
        });
        const timeoutPromise = new Promise((_resolve, reject) => {
            const timeoutSeconds = (timeoutMs / 1000).toString();
            timer = setTimeout(() => {
                reject(new Error(`html2canvas timed out after ${timeoutSeconds}s`));
            }, timeoutMs);
        });
        const renderPromise = html2canvas(targetInfo.base, {
            backgroundColor: null,
            scale: browserWindow?.devicePixelRatio || 1,
            x: targetInfo.clip?.x,
            y: targetInfo.clip?.y,
            width: targetInfo.clip?.width,
            height: targetInfo.clip?.height,
            scrollX: browserWindow ? -browserWindow.scrollX : undefined,
            scrollY: browserWindow ? -browserWindow.scrollY : undefined,
            useCORS: true,
            allowTaint: true,
            imageTimeout: 5000,
            removeContainer: true,
            logging: true,
            onclone: (clonedDocument) => {
                const cloneWindow = clonedDocument.defaultView;
                const cloneTarget = clonedDocument.querySelector(`[${HTML2CANVAS_TARGET_ATTR}="${markerValue}"]`);
                if (!cloneWindow || !cloneTarget || !(cloneTarget instanceof cloneWindow.HTMLElement)) {
                    return;
                }
                const rect = targetInfo.base.getBoundingClientRect();
                const widthPx = Math.ceil(rect.width).toString();
                const heightPx = Math.ceil(rect.height).toString();
                cloneTarget.removeAttribute(HTML2CANVAS_TARGET_ATTR);
                cloneTarget.style.width = `${widthPx}px`;
                cloneTarget.style.minWidth = cloneTarget.style.width;
                cloneTarget.style.maxWidth = cloneTarget.style.width;
                cloneTarget.style.height = `${heightPx}px`;
                cloneTarget.style.minHeight = cloneTarget.style.height;
                cloneTarget.style.maxHeight = cloneTarget.style.height;
                cloneTarget.style.boxSizing = 'border-box';
                const wrapper = clonedDocument.createElement('div');
                wrapper.style.display = 'inline-block';
                wrapper.style.padding = '0';
                wrapper.style.margin = '0';
                wrapper.style.border = 'none';
                const computedBackground = getComputedStyle(targetInfo.base).backgroundColor;
                wrapper.style.background = computedBackground || 'transparent';
                wrapper.style.width = cloneTarget.style.width;
                wrapper.style.height = cloneTarget.style.height;
                cloneTarget.replaceWith(wrapper);
                wrapper.append(cloneTarget);
            },
        });
        canvasResult = await Promise.race([timeoutPromise, renderPromise]);
    }
    finally {
        restoreColors();
        if (markerAssigned) {
            targetInfo.base.removeAttribute(HTML2CANVAS_TARGET_ATTR);
        }
        if (timer) {
            clearTimeout(timer);
        }
        console.info('[SweetLink] html2canvas capture finished');
    }
    if (!(canvasResult instanceof HTMLCanvasElement)) {
        throw new TypeError('html2canvas did not return a canvas element');
    }
    const canvas = canvasResult;
    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => {
            if (value) {
                resolve(value);
            }
            else {
                reject(new Error('Failed to encode screenshot to JPEG'));
            }
        }, 'image/jpeg', quality);
    }).catch((error) => {
        recordScreenshotError('html2canvas', error);
        throw error;
    });
    const base64 = await blobToBase64(blob).catch((error) => {
        recordScreenshotError('html2canvas', error);
        throw error;
    });
    return {
        mimeType: 'image/jpeg',
        base64,
        width: canvas.width,
        height: canvas.height,
        renderer: 'html2canvas',
    };
}
async function blobToBase64(blob) {
    const buffer = await blob.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 32768;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCodePoint(...chunk);
    }
    return btoa(binary);
}
//# sourceMappingURL=html2canvas.js.map