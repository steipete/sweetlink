export interface SweetLinkCookieMapping {
    hosts: string[];
    origins: string[];
}
export interface SweetLinkHealthChecksConfig {
    paths: string[];
}
export interface SweetLinkSmokeRoutesConfig {
    defaults?: string[];
    presets?: Record<string, string[]>;
}
export type SweetLinkRedirectsConfig = Record<string, string>;
export interface SweetLinkServerConfig {
    env: string;
    start?: string[];
    check?: string[];
    cwd?: string;
    timeoutMs?: number;
}
export interface SweetLinkFileConfig {
    appLabel?: string;
    appUrl?: string;
    prodUrl?: string;
    daemonUrl?: string;
    adminKey?: string;
    port?: number;
    cookieMappings?: SweetLinkCookieMapping[];
    healthChecks?: SweetLinkHealthChecksConfig;
    smokeRoutes?: SweetLinkSmokeRoutesConfig;
    redirects?: SweetLinkRedirectsConfig;
    servers?: SweetLinkServerConfig[];
    oauthScript?: string;
}
interface LoadedConfig {
    readonly path: string | null;
    readonly config: SweetLinkFileConfig;
}
export declare function resetSweetLinkFileConfigCache(): void;
export declare function loadSweetLinkFileConfig(): LoadedConfig;
export {};
//# sourceMappingURL=config-file.d.ts.map