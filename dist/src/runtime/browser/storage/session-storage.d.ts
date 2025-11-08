import type { SweetLinkStorageAdapter, SweetLinkStoredSession } from '../types';
export declare const isStoredSessionFresh: (session: SweetLinkStoredSession, now?: number) => boolean;
export interface SessionStorageAdapterOptions {
    readonly windowRef?: Window | null;
}
export declare function createSessionStorageAdapter(options?: SessionStorageAdapterOptions): SweetLinkStorageAdapter;
export declare const sessionStorageHelpers: {
    loadStoredSession: (windowRef: Window | null) => SweetLinkStoredSession | null;
    saveStoredSession: (session: SweetLinkStoredSession, windowRef: Window | null) => void;
    clearStoredSession: (windowRef: Window | null) => void;
    updateStoredSessionCodename: (codename: string | null, windowRef: Window | null) => void;
};
//# sourceMappingURL=session-storage.d.ts.map