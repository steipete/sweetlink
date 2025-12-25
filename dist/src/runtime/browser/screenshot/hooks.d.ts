import type { SweetLinkScreenshotCommand } from '@sweetlink/shared';
import { z } from 'zod';
import type { ScreenshotTargetInfo } from '../types.js';
type HookRunner = (clientWindow: Window, document_: Document, target: HTMLElement) => Promise<void> | void;
export declare const screenshotHookSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"scrollIntoView">;
    selector: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNull]>>;
    behavior: z.ZodOptional<z.ZodEnum<{
        auto: "auto";
        smooth: "smooth";
        instant: "instant";
    }>>;
    block: z.ZodOptional<z.ZodEnum<{
        start: "start";
        center: "center";
        end: "end";
        nearest: "nearest";
    }>>;
}, z.core.$loose>, z.ZodObject<{
    type: z.ZodLiteral<"waitForSelector">;
    selector: z.ZodString;
    visibility: z.ZodOptional<z.ZodEnum<{
        any: "any";
        visible: "visible";
    }>>;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
}, z.core.$loose>, z.ZodObject<{
    type: z.ZodLiteral<"waitForIdle">;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
    frameCount: z.ZodOptional<z.ZodNumber>;
}, z.core.$loose>, z.ZodObject<{
    type: z.ZodLiteral<"wait">;
    ms: z.ZodNumber;
}, z.core.$loose>, z.ZodObject<{
    type: z.ZodLiteral<"script">;
    code: z.ZodString;
}, z.core.$loose>], "type">;
export type ScreenshotHook = z.infer<typeof screenshotHookSchema>;
export declare const createHookRunner: (source: string) => HookRunner;
export declare function applyScreenshotPreHooks(command: SweetLinkScreenshotCommand, initialTarget: ScreenshotTargetInfo): Promise<void>;
export declare const delay: (ms: number) => Promise<void>;
export {};
//# sourceMappingURL=hooks.d.ts.map