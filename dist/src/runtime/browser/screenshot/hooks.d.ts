import type { SweetLinkScreenshotCommand } from '@sweetlink/shared';
import { z } from 'zod';
import type { ScreenshotTargetInfo } from '../types.js';
type HookRunner = (clientWindow: Window, document_: Document, target: HTMLElement) => Promise<void> | void;
export declare const screenshotHookSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"scrollIntoView">;
    selector: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    behavior: z.ZodOptional<z.ZodEnum<["auto", "smooth", "instant"]>>;
    block: z.ZodOptional<z.ZodEnum<["start", "center", "end", "nearest"]>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    type: z.ZodLiteral<"scrollIntoView">;
    selector: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    behavior: z.ZodOptional<z.ZodEnum<["auto", "smooth", "instant"]>>;
    block: z.ZodOptional<z.ZodEnum<["start", "center", "end", "nearest"]>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    type: z.ZodLiteral<"scrollIntoView">;
    selector: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    behavior: z.ZodOptional<z.ZodEnum<["auto", "smooth", "instant"]>>;
    block: z.ZodOptional<z.ZodEnum<["start", "center", "end", "nearest"]>>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
    type: z.ZodLiteral<"waitForSelector">;
    selector: z.ZodString;
    visibility: z.ZodOptional<z.ZodEnum<["any", "visible"]>>;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    type: z.ZodLiteral<"waitForSelector">;
    selector: z.ZodString;
    visibility: z.ZodOptional<z.ZodEnum<["any", "visible"]>>;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    type: z.ZodLiteral<"waitForSelector">;
    selector: z.ZodString;
    visibility: z.ZodOptional<z.ZodEnum<["any", "visible"]>>;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
    type: z.ZodLiteral<"waitForIdle">;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
    frameCount: z.ZodOptional<z.ZodNumber>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    type: z.ZodLiteral<"waitForIdle">;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
    frameCount: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    type: z.ZodLiteral<"waitForIdle">;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
    frameCount: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
    type: z.ZodLiteral<"wait">;
    ms: z.ZodNumber;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    type: z.ZodLiteral<"wait">;
    ms: z.ZodNumber;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    type: z.ZodLiteral<"wait">;
    ms: z.ZodNumber;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
    type: z.ZodLiteral<"script">;
    code: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    type: z.ZodLiteral<"script">;
    code: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    type: z.ZodLiteral<"script">;
    code: z.ZodString;
}, z.ZodTypeAny, "passthrough">>]>;
export type ScreenshotHook = z.infer<typeof screenshotHookSchema>;
export declare const createHookRunner: (source: string) => HookRunner;
export declare function applyScreenshotPreHooks(command: SweetLinkScreenshotCommand, initialTarget: ScreenshotTargetInfo): Promise<void>;
export declare const delay: (ms: number) => Promise<void>;
export {};
//# sourceMappingURL=hooks.d.ts.map