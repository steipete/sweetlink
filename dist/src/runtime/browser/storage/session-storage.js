import { getBrowserWindow } from '../utils/environment.js';
import { isRecord } from '../utils/object.js';
const STORAGE_KEY = 'sweetlink:last-session';
const EXPIRY_SAFETY_MARGIN_MS = 5000;
const hasSessionStorage = (windowRef) => {
    if (!windowRef) {
        return false;
    }
    try {
        return windowRef.sessionStorage !== undefined;
    }
    catch {
        return false;
    }
};
const parseStoredValue = (raw) => {
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!isRecord(parsed)) {
            return null;
        }
        const sessionId = typeof parsed.sessionId === 'string' ? parsed.sessionId : null;
        const sessionToken = typeof parsed.sessionToken === 'string' ? parsed.sessionToken : null;
        const socketUrl = typeof parsed.socketUrl === 'string' ? parsed.socketUrl : null;
        const expiresAtMs = typeof parsed.expiresAtMs === 'number' && Number.isFinite(parsed.expiresAtMs) ? parsed.expiresAtMs : null;
        const codename = typeof parsed.codename === 'string' ? parsed.codename : null;
        if (!((sessionId && sessionToken) && socketUrl)) {
            return null;
        }
        return {
            sessionId,
            sessionToken,
            socketUrl,
            expiresAtMs,
            codename,
        };
    }
    catch {
        return null;
    }
};
const loadStoredSession = (windowRef) => {
    if (!hasSessionStorage(windowRef)) {
        return null;
    }
    try {
        const raw = windowRef?.sessionStorage.getItem(STORAGE_KEY) ?? null;
        const session = parseStoredValue(raw);
        if (!session) {
            windowRef?.sessionStorage.removeItem(STORAGE_KEY);
        }
        return session;
    }
    catch {
        return null;
    }
};
const saveStoredSession = (session, windowRef) => {
    if (!hasSessionStorage(windowRef)) {
        return;
    }
    try {
        windowRef?.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    }
    catch {
        /* ignore persist errors */
    }
};
const updateStoredSessionCodename = (codename, windowRef) => {
    const current = loadStoredSession(windowRef);
    if (!current) {
        return;
    }
    const normalizedCodename = typeof codename === 'string' && codename.trim().length > 0 ? codename.trim() : null;
    if (current.codename === normalizedCodename) {
        return;
    }
    saveStoredSession({
        ...current,
        codename: normalizedCodename,
    }, windowRef);
};
const clearStoredSession = (windowRef) => {
    if (!hasSessionStorage(windowRef)) {
        return;
    }
    try {
        windowRef?.sessionStorage.removeItem(STORAGE_KEY);
    }
    catch {
        /* ignore */
    }
};
export const isStoredSessionFresh = (session, now = Date.now()) => {
    if (session.expiresAtMs == null) {
        return true;
    }
    return session.expiresAtMs - EXPIRY_SAFETY_MARGIN_MS > now;
};
export function createSessionStorageAdapter(options = {}) {
    const windowRef = options.windowRef ?? getBrowserWindow();
    return {
        load: () => loadStoredSession(windowRef),
        save: (session) => saveStoredSession(session, windowRef),
        clear: () => clearStoredSession(windowRef),
        updateCodename: (codename) => updateStoredSessionCodename(codename, windowRef),
        isFresh: (session, now) => isStoredSessionFresh(session, now),
    };
}
export const sessionStorageHelpers = {
    loadStoredSession,
    saveStoredSession,
    clearStoredSession,
    updateStoredSessionCodename,
};
//# sourceMappingURL=session-storage.js.map