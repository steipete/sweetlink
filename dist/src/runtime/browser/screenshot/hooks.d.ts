import type { SweetLinkScreenshotCommand } from '@sweetlink/shared';
import type { ScreenshotTargetInfo } from '../types.js';
type HookRunner = (clientWindow: Window, document_: Document, target: HTMLElement) => Promise<void> | void;
export type ScreenshotHook = {
    readonly type: 'scrollIntoView';
    readonly selector?: string | null;
    readonly behavior?: ScrollBehavior;
    readonly block?: ScrollLogicalPosition;
} | {
    readonly type: 'waitForSelector';
    readonly selector: string;
    readonly visibility?: 'any' | 'visible';
    readonly timeoutMs?: number;
} | {
    readonly type: 'waitForIdle';
    readonly timeoutMs?: number;
    readonly frameCount?: number;
} | {
    readonly type: 'wait';
    readonly ms: number;
} | {
    readonly type: 'script';
    readonly code: string;
};
export declare const isScreenshotHook: (candidate: unknown) => candidate is ScreenshotHook;
export declare const createHookRunner: (source: string) => HookRunner;
export declare function applyScreenshotPreHooks(command: SweetLinkScreenshotCommand, initialTarget: ScreenshotTargetInfo): Promise<void>;
export declare const delay: (ms: number) => Promise<void>;
export {};
//# sourceMappingURL=hooks.d.ts.map