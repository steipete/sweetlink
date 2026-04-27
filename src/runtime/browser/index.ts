/* biome-ignore lint/performance/noBarrelFile: re-exporting browser helpers to preserve public API surface. */
export { createSweetLinkClient, sweetLinkBrowserTestHelpers } from "./client.js";
export { createSessionStorageAdapter, isStoredSessionFresh } from "./storage/session-storage.js";
export type {
  SweetLinkClient,
  SweetLinkClientOptions,
  SweetLinkHandshakeResponse,
  SweetLinkSessionBootstrap,
  SweetLinkStatusSnapshot,
  SweetLinkStoredSession,
} from "./types.js";
