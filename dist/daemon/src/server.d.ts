import "dotenv/config";
import { type SweetLinkCommandResult, type SweetLinkConsoleEvent, type SweetLinkSessionSummary } from "../../shared/src/index.js";
import WebSocket from "ws";
import { z } from "zod";
declare const commandSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"runScript">;
    code: z.ZodString;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
    captureConsole: z.ZodOptional<z.ZodBoolean>;
}, z.core.$loose>, z.ZodObject<{
    type: z.ZodLiteral<"getDom">;
    selector: z.ZodOptional<z.ZodString>;
    includeShadowDom: z.ZodOptional<z.ZodBoolean>;
}, z.core.$loose>, z.ZodObject<{
    type: z.ZodLiteral<"navigate">;
    url: z.ZodString;
}, z.core.$loose>, z.ZodObject<{
    type: z.ZodLiteral<"ping">;
}, z.core.$loose>, z.ZodObject<{
    type: z.ZodLiteral<"screenshot">;
    mode: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<"full">, z.ZodLiteral<"element">]>>;
    selector: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNull]>>;
    quality: z.ZodOptional<z.ZodNumber>;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
    renderer: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<"auto">, z.ZodLiteral<"puppeteer">, z.ZodLiteral<"html2canvas">, z.ZodLiteral<"html-to-image">]>>;
    hooks: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
}, z.core.$loose>, z.ZodObject<{
    type: z.ZodLiteral<"discoverSelectors">;
    scopeSelector: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNull]>>;
    limit: z.ZodOptional<z.ZodNumber>;
    includeHidden: z.ZodOptional<z.ZodBoolean>;
}, z.core.$loose>], "type">;
type ConsoleEvent = SweetLinkConsoleEvent;
type CommandResult = SweetLinkCommandResult;
type CommandWithoutId = z.infer<typeof commandSchema>;
export declare function runDaemon(): Promise<void>;
export declare class SweetLinkState {
    #private;
    constructor(secret: string);
    verifyCliToken(token: string): import("../../shared/src/index.js").SweetLinkTokenPayload;
    handleSocket(socket: WebSocket): void;
    listSessions(): SweetLinkSessionSummary[];
    sendCommand(sessionId: string, rawCommand: CommandWithoutId, timeoutMs?: number): Promise<CommandResult>;
    getSessionConsole(sessionId: string): ConsoleEvent[];
}
export {};
//# sourceMappingURL=server.d.ts.map