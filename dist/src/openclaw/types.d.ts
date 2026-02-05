/** OpenClaw configuration section in sweetlink.json. */
export interface OpenClawConfig {
    readonly enabled: boolean;
    readonly url: string;
    readonly profile: string;
    readonly snapshotFormat: 'ai' | 'aria';
    readonly refs: 'role' | 'aria';
    readonly efficient: boolean;
}
/** Defaults applied when values are missing from config / env. */
export declare const OPENCLAW_DEFAULTS: OpenClawConfig;
export interface OpenClawHealthResponse {
    readonly running: boolean;
    readonly cdpReady: boolean;
}
export interface OpenClawSnapshotParams {
    readonly format?: 'ai' | 'aria';
    readonly mode?: 'efficient';
    readonly refs?: 'role' | 'aria';
    readonly interactive?: boolean;
    readonly compact?: boolean;
    readonly depth?: number;
    readonly maxChars?: number;
    readonly labels?: boolean;
    readonly selector?: string;
    readonly frame?: string;
    readonly targetId?: string;
}
export interface OpenClawRefEntry {
    readonly role: string;
    readonly name?: string;
    readonly nth?: number;
}
export interface OpenClawSnapshotStats {
    readonly lines: number;
    readonly chars: number;
    readonly refs: number;
    readonly interactive: number;
}
export interface OpenClawSnapshotAiResponse {
    readonly ok: true;
    readonly format: 'ai';
    readonly targetId: string;
    readonly url: string;
    readonly snapshot: string;
    readonly truncated?: boolean;
    readonly refs?: Record<string, OpenClawRefEntry>;
    readonly stats?: OpenClawSnapshotStats;
    readonly labels?: boolean;
    readonly labelsCount?: number;
    readonly imagePath?: string;
    readonly imageType?: 'png' | 'jpeg';
}
export interface OpenClawAriaNode {
    readonly ref: string;
    readonly role: string;
    readonly name: string;
    readonly value?: string;
    readonly description?: string;
    readonly depth: number;
}
export interface OpenClawSnapshotAriaResponse {
    readonly ok: true;
    readonly format: 'aria';
    readonly targetId: string;
    readonly url: string;
    readonly nodes: OpenClawAriaNode[];
}
export type OpenClawSnapshotResponse = OpenClawSnapshotAiResponse | OpenClawSnapshotAriaResponse;
interface ActionBase {
    readonly timeoutMs?: number;
}
export interface ClickAction extends ActionBase {
    readonly kind: 'click';
    readonly ref: string;
    readonly doubleClick?: boolean;
    readonly button?: 'left' | 'right' | 'middle';
    readonly modifiers?: ('Alt' | 'Control' | 'Meta' | 'Shift')[];
}
export interface TypeAction extends ActionBase {
    readonly kind: 'type';
    readonly ref: string;
    readonly text: string;
    readonly submit?: boolean;
    readonly slowly?: boolean;
}
export interface PressAction {
    readonly kind: 'press';
    readonly key: string;
    readonly delayMs?: number;
}
export interface HoverAction extends ActionBase {
    readonly kind: 'hover';
    readonly ref: string;
}
export interface DragAction extends ActionBase {
    readonly kind: 'drag';
    readonly startRef: string;
    readonly endRef: string;
}
export interface SelectAction extends ActionBase {
    readonly kind: 'select';
    readonly ref: string;
    readonly values: string[];
}
export interface FillField {
    readonly ref: string;
    readonly type: string;
    readonly value?: string | number | boolean;
}
export interface FillAction extends ActionBase {
    readonly kind: 'fill';
    readonly fields: FillField[];
}
export interface ResizeAction {
    readonly kind: 'resize';
    readonly width: number;
    readonly height: number;
}
export interface WaitAction extends ActionBase {
    readonly kind: 'wait';
    readonly timeMs?: number;
    readonly text?: string;
    readonly textGone?: string;
    readonly selector?: string;
    readonly url?: string;
    readonly loadState?: 'load' | 'domcontentloaded' | 'networkidle';
    readonly fn?: string;
}
export interface EvaluateAction {
    readonly kind: 'evaluate';
    readonly fn: string;
    readonly ref?: string;
}
export interface CloseAction {
    readonly kind: 'close';
    readonly targetId?: string;
}
export type OpenClawAction = ClickAction | TypeAction | PressAction | HoverAction | DragAction | SelectAction | FillAction | ResizeAction | WaitAction | EvaluateAction | CloseAction;
export interface OpenClawActionResponse {
    readonly ok: true;
    readonly targetId: string;
    readonly url?: string;
    readonly result?: unknown;
}
export interface OpenClawScreenshotParams {
    readonly targetId?: string;
    readonly fullPage?: boolean;
    readonly ref?: string;
    readonly element?: string;
    readonly type?: 'png' | 'jpeg';
}
export interface OpenClawScreenshotResponse {
    readonly ok: true;
    readonly path: string;
    readonly targetId: string;
    readonly url: string;
}
export interface OpenClawNavigateParams {
    readonly url: string;
    readonly targetId?: string;
}
export interface OpenClawNavigateResponse {
    readonly ok: true;
    readonly targetId: string;
    readonly url: string;
}
export interface OpenClawTab {
    readonly targetId: string;
    readonly title: string;
    readonly url: string;
}
export interface OpenClawTabsResponse {
    readonly running: boolean;
    readonly tabs: OpenClawTab[];
}
export interface OpenClawPdfResponse {
    readonly ok: true;
    readonly path: string;
    readonly targetId: string;
    readonly url: string;
}
export interface OpenClawDialogParams {
    readonly accept: boolean;
    readonly promptText?: string;
    readonly targetId?: string;
    readonly timeoutMs?: number;
}
export interface OpenClawFileUploadParams {
    readonly paths: string[];
    readonly ref?: string;
    readonly inputRef?: string;
    readonly targetId?: string;
    readonly timeoutMs?: number;
}
export declare class OpenClawError extends Error {
    readonly statusCode: number;
    readonly upstream: string | undefined;
    constructor(message: string, statusCode: number, upstream?: string);
}
export {};
//# sourceMappingURL=types.d.ts.map