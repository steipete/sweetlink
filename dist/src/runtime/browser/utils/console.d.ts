import type { SweetLinkConsoleLevel } from '@sweetlink/shared';
export declare const CONSOLE_LEVELS: SweetLinkConsoleLevel[];
export declare function getConsoleMethod<Level extends SweetLinkConsoleLevel>(target: Console, level: Level): Console[Level] | undefined;
export declare function setConsoleMethod<Level extends SweetLinkConsoleLevel>(target: Console, level: Level, function_: Console[Level] | undefined): void;
//# sourceMappingURL=console.d.ts.map