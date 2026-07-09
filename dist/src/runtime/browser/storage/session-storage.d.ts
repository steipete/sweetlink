import type { SweetLinkStorageAdapter, SweetLinkStoredSession } from "../types.js";
declare const loadStoredSession: (windowRef: Window | null) => SweetLinkStoredSession | null;
declare const saveStoredSession: (session: SweetLinkStoredSession, windowRef: Window | null) => void;
declare const updateStoredSessionCodename: (codename: string | null, windowRef: Window | null) => void;
declare const clearStoredSession: (windowRef: Window | null) => void;
export declare const isStoredSessionFresh: (session: SweetLinkStoredSession, now?: number) => boolean;
export interface SessionStorageAdapterOptions {
    readonly windowRef?: Window | null;
}
export declare function createSessionStorageAdapter(options?: SessionStorageAdapterOptions): SweetLinkStorageAdapter;
export declare const sessionStorageHelpers: {
    loadStoredSession: typeof loadStoredSession;
    saveStoredSession: typeof saveStoredSession;
    clearStoredSession: typeof clearStoredSession;
    updateStoredSessionCodename: typeof updateStoredSessionCodename;
};
export {};
//# sourceMappingURL=session-storage.d.ts.map