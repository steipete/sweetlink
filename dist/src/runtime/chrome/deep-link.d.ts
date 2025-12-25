import type { TwitterOauthAutoAcceptResult } from '../devtools/types.js';
export interface DeepLinkAuthFlowResult {
    readonly signInClicked: boolean;
    readonly navigatedToTarget: boolean;
    readonly finalUrl: string | null;
    readonly oauthAttempt?: TwitterOauthAutoAcceptResult;
}
export declare function ensureDeepLinkAuthFlow(params: {
    devtoolsUrl: string;
    targetUrl: string;
    oauthScriptPath: string | null;
}): Promise<DeepLinkAuthFlowResult>;
//# sourceMappingURL=deep-link.d.ts.map