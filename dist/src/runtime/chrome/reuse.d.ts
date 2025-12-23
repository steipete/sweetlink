export declare function reuseExistingControlledChrome(target: string, options: {
    preferredPort?: number;
    cookieSync: boolean;
    bringToFront?: boolean;
}): Promise<{
    devtoolsUrl: string;
    targetAlreadyOpen: boolean;
    userDataDir?: string;
} | null>;
export declare function findAvailablePort(start?: number, end?: number): Promise<number>;
export declare function persistDevToolsReuse(devtoolsUrl: string, port: number | null, target: string, userDataDirectoryHint?: string | null): Promise<string | null>;
export declare function extractPortFromUrl(devtoolsUrl: string): number | null;
//# sourceMappingURL=reuse.d.ts.map