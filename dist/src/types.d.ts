export interface CliConfig {
    readonly appLabel: string;
    readonly appBaseUrl: string;
    readonly daemonBaseUrl: string;
    readonly adminApiKey: string | null;
    readonly oauthScriptPath: string | null;
    readonly servers: Record<string, ServerConfig>;
}
export type CachedCliTokenSource = 'secret' | 'api';
export interface ServerConfig {
    readonly env: string;
    readonly start: string[] | null;
    readonly check: string[] | null;
    readonly cwd: string | null;
    readonly timeoutMs: number | null;
}
//# sourceMappingURL=types.d.ts.map