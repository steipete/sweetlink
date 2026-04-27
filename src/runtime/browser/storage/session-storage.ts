import type { SweetLinkStorageAdapter, SweetLinkStoredSession } from "../types.js";
import { getBrowserWindow } from "../utils/environment.js";
import { isRecord } from "../utils/object.js";

const STORAGE_KEY = "sweetlink:last-session";
const EXPIRY_SAFETY_MARGIN_MS = 5000;

const hasSessionStorage = (windowRef: Window | null): boolean => {
  if (!windowRef) {
    return false;
  }
  try {
    return windowRef.sessionStorage !== undefined;
  } catch {
    return false;
  }
};

const parseStoredValue = (raw: string | null): SweetLinkStoredSession | null => {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return null;
    }
    const sessionId = typeof parsed.sessionId === "string" ? parsed.sessionId : null;
    const sessionToken = typeof parsed.sessionToken === "string" ? parsed.sessionToken : null;
    const socketUrl = typeof parsed.socketUrl === "string" ? parsed.socketUrl : null;
    const expiresAtMs =
      typeof parsed.expiresAtMs === "number" && Number.isFinite(parsed.expiresAtMs)
        ? parsed.expiresAtMs
        : null;
    const codename = typeof parsed.codename === "string" ? parsed.codename : null;
    if (!(sessionId && sessionToken && socketUrl)) {
      return null;
    }
    return {
      sessionId,
      sessionToken,
      socketUrl,
      expiresAtMs,
      codename,
    };
  } catch {
    return null;
  }
};

const loadStoredSession = (windowRef: Window | null): SweetLinkStoredSession | null => {
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
  } catch {
    return null;
  }
};

const saveStoredSession = (session: SweetLinkStoredSession, windowRef: Window | null): void => {
  if (!hasSessionStorage(windowRef)) {
    return;
  }
  try {
    windowRef?.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* ignore persist errors */
  }
};

const updateStoredSessionCodename = (codename: string | null, windowRef: Window | null): void => {
  const current = loadStoredSession(windowRef);
  if (!current) {
    return;
  }
  const normalizedCodename =
    typeof codename === "string" && codename.trim().length > 0 ? codename.trim() : null;
  if (current.codename === normalizedCodename) {
    return;
  }
  saveStoredSession(
    {
      ...current,
      codename: normalizedCodename,
    },
    windowRef,
  );
};

const clearStoredSession = (windowRef: Window | null): void => {
  if (!hasSessionStorage(windowRef)) {
    return;
  }
  try {
    windowRef?.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
};

export const isStoredSessionFresh = (
  session: SweetLinkStoredSession,
  now: number = Date.now(),
): boolean => {
  if (session.expiresAtMs == null) {
    return true;
  }
  return session.expiresAtMs - EXPIRY_SAFETY_MARGIN_MS > now;
};

export interface SessionStorageAdapterOptions {
  readonly windowRef?: Window | null;
}

export function createSessionStorageAdapter(
  options: SessionStorageAdapterOptions = {},
): SweetLinkStorageAdapter {
  const windowRef = options.windowRef ?? getBrowserWindow();

  return {
    load: () => loadStoredSession(windowRef),
    save: (session: SweetLinkStoredSession) => saveStoredSession(session, windowRef),
    clear: () => clearStoredSession(windowRef),
    updateCodename: (codename: string | null) => updateStoredSessionCodename(codename, windowRef),
    isFresh: (session: SweetLinkStoredSession, now?: number) => isStoredSessionFresh(session, now),
  };
}

export const sessionStorageHelpers = {
  loadStoredSession,
  saveStoredSession,
  clearStoredSession,
  updateStoredSessionCodename,
};
