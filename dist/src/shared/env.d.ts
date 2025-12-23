export interface SweetLinkSharedEnv {
    readonly appLabel: string;
    readonly appUrl: string;
    readonly prodAppUrl: string;
    readonly daemonUrl: string;
    readonly port: number;
    readonly secret: string | null;
    readonly isProduction: boolean;
    readonly localAdminApiKey: string | null;
    readonly adminApiKey: string | null;
    readonly cliCaPath: string | null;
    readonly cliCaRoot: string;
    readonly cliChromePath: string | null;
    readonly cliDevtoolsUrl: string | null;
    readonly cliChromeProfilePath: string | null;
    readonly cliCookieDebug: boolean;
    readonly cliOauthScriptPath: string | null;
    readonly debug: boolean;
    readonly cliTestMode: boolean;
}
export declare function readSweetLinkEnv(): SweetLinkSharedEnv;
export declare const sweetLinkEnv: SweetLinkSharedEnv;
//# sourceMappingURL=env.d.ts.map