import type { SweetLinkSharedEnv } from '../shared/src/env.js';
export declare const sweetLinkEnv: SweetLinkSharedEnv;
export declare const sweetLinkDebug: boolean;
export declare const sweetLinkCliTestMode: boolean;
export interface SweetLinkCliEnv {
    readonly caPath: string | null;
    readonly caRoot: string;
    readonly chromePath: string | null;
    readonly devtoolsUrl: string | null;
    readonly chromeProfilePath: string | null;
    readonly cookieDebug: boolean;
    readonly oauthScriptPath: string | null;
}
export declare function readCliEnv(): SweetLinkCliEnv;
export declare const cliEnv: SweetLinkCliEnv;
//# sourceMappingURL=env.d.ts.map