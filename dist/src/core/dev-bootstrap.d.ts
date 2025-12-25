import type { CliConfig } from '../types.js';
export interface DevBootstrapResult {
    readonly adminApiKey: string | null;
    readonly loginPath: string | null;
    readonly redirectParam: string | null;
}
export declare function loadDevBootstrap(config: CliConfig): Promise<DevBootstrapResult | null>;
export declare function getCachedDevBootstrap(): DevBootstrapResult | null;
export declare function buildDevBootstrapLoginUrl(targetUrl: string): string | null;
//# sourceMappingURL=dev-bootstrap.d.ts.map