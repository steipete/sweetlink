import type { SweetLinkCommand, SweetLinkCommandResult } from '@sweetlink/shared';
import type { SweetLinkScreenshotHooks } from '../types.js';
export interface CommandExecutor {
    execute(command: SweetLinkCommand): Promise<SweetLinkCommandResult>;
}
export interface CommandExecutorContext {
    readonly screenshotHooks: SweetLinkScreenshotHooks;
}
export declare function createCommandExecutor(context: CommandExecutorContext): CommandExecutor;
//# sourceMappingURL=index.d.ts.map