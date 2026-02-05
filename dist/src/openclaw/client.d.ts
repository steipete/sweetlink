import type { OpenClawAction, OpenClawActionResponse, OpenClawConfig, OpenClawDialogParams, OpenClawFileUploadParams, OpenClawHealthResponse, OpenClawNavigateParams, OpenClawNavigateResponse, OpenClawPdfResponse, OpenClawScreenshotParams, OpenClawScreenshotResponse, OpenClawSnapshotParams, OpenClawSnapshotResponse, OpenClawTab, OpenClawTabsResponse } from './types.js';
export declare class OpenClawClient {
    private readonly baseUrl;
    private readonly profile;
    private healthCache;
    constructor(config: Pick<OpenClawConfig, 'url' | 'profile'>);
    health(options?: {
        skipCache?: boolean;
    }): Promise<OpenClawHealthResponse>;
    isReady(): Promise<boolean>;
    snapshot(params?: OpenClawSnapshotParams): Promise<OpenClawSnapshotResponse>;
    act(action: OpenClawAction): Promise<OpenClawActionResponse>;
    screenshot(params?: OpenClawScreenshotParams): Promise<OpenClawScreenshotResponse>;
    navigate(params: OpenClawNavigateParams): Promise<OpenClawNavigateResponse>;
    tabs(): Promise<OpenClawTabsResponse>;
    openTab(url: string): Promise<OpenClawTab>;
    focusTab(targetId: string): Promise<{
        ok: true;
    }>;
    closeTab(targetId: string): Promise<{
        ok: true;
    }>;
    pdf(targetId?: string): Promise<OpenClawPdfResponse>;
    dialog(params: OpenClawDialogParams): Promise<{
        ok: true;
    }>;
    fileUpload(params: OpenClawFileUploadParams): Promise<{
        ok: true;
    }>;
    private get;
    private post;
    private delete;
    private buildUrl;
    private handleResponse;
}
//# sourceMappingURL=client.d.ts.map