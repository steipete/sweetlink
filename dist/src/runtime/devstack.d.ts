import type { ServerConfig } from '../types.js';
/** Registers the mkcert CA with undici so HTTPS requests succeed without NODE_TLS_REJECT_UNAUTHORIZED hacks. */
export declare function maybeInstallMkcertDispatcher(): void;
interface EnsureDevStackOptions {
    readonly repoRoot: string;
    readonly healthPaths?: readonly string[];
    readonly server?: ServerConfig;
}
/** Ensures the local dev server is online, optionally attempting to start it via configured command. */
export declare function ensureDevStackRunning(targetUrl: URL, options: EnsureDevStackOptions): Promise<void>;
/** Performs lightweight HEAD requests to confirm the web app responds. */
export declare function isAppReachable(appBaseUrl: string, healthPaths?: readonly string[]): Promise<boolean>;
export {};
//# sourceMappingURL=devstack.d.ts.map