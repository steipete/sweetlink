import type { TwitterOauthAutoAcceptResult } from './types.js';
interface AttemptOauthAutomationParameters {
    devtoolsUrl: string;
    sessionUrl: string;
    scriptPath: string | null;
}
export declare function attemptTwitterOauthAutoAccept({ devtoolsUrl, sessionUrl, scriptPath, }: AttemptOauthAutomationParameters): Promise<TwitterOauthAutoAcceptResult>;
export {};
//# sourceMappingURL=oauth.d.ts.map