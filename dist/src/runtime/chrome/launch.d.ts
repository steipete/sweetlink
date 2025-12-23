export declare function launchChrome(target: string, options?: {
    foreground?: boolean;
}): Promise<void>;
export declare function launchControlledChrome(target: string, options: {
    port?: number;
    cookieSync: boolean;
    headless?: boolean;
    foreground?: boolean;
}): Promise<{
    port: number;
    userDataDir: string;
    devtoolsUrl: string;
}>;
export declare function prepareChromeLaunch(platform: NodeJS.Platform, chromePath: string, chromeArgs: string[], options?: {
    background?: boolean;
}): {
    command: string;
    args: string[];
};
export declare function spawnChromeDetached(chromePath: string, chromeArgs: string[], options?: {
    background?: boolean;
}): Promise<void>;
//# sourceMappingURL=launch.d.ts.map