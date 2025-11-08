import type { CliConfig } from '../../types.js';
export declare function signalSweetLinkBootstrap(devtoolsUrl: string, targetUrl: string): Promise<void>;
export declare function waitForSweetLinkSession(params: {
    config: CliConfig;
    token: string | null;
    targetUrl: string;
    timeoutSeconds: number;
    devtoolsUrl?: string;
}): Promise<{
    sessionId: string;
    url: string;
} | null>;
//# sourceMappingURL=session.d.ts.map