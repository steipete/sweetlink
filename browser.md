---
summary: 'How to embed the SweetLink browser runtime into your web app using the open-source client bundle.'
---

# SweetLink Browser Runtime

SweetLink now ships a browser-ready runtime so any app can bootstrap the in-tab client without copying the Sweetistics monorepo glue. The runtime lives under `sweetlink/runtime/browser` and provides the exact session features used in production.

## Installation

```bash
pnpm add sweetlink
```

> The package already declares the correct dependencies (`arkregex`, `es-toolkit`, etc.). When you consume it from another repo you still need to expose the daemon handshake endpoint described below.

## Quick Start

```ts
// app/sweetlink/client.ts
import {
  createSessionStorageAdapter,
  createSweetLinkClient,
  type SweetLinkSessionBootstrap,
} from 'sweetlink/runtime/browser';

const storage = createSessionStorageAdapter();

export const sweetLinkClient = createSweetLinkClient({
  storage,
  status: {
    onStatusSnapshot: (snapshot) => {
      // feed into your Zustand/mobx store, postMessage, etc.
    },
  },
  autoReconnectHandshake: async () => {
    const response = await fetch('/api/admin/sweetlink/remote-handshake', { method: 'POST' });
    if (!response.ok) {
      throw new Error(`Handshake failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as SweetLinkSessionBootstrap;
  },
});
```

Then, from your activation hook:

```ts
import { sweetLinkClient } from '@/sweetlink/client';

await sweetLinkClient.startSession({
  sessionId,
  sessionToken,
  socketUrl,
  expiresAtMs,
  codename,
});
```

The runtime takes care of:

- WebSocket lifecycle + heartbeats
- Console buffering/flush
- Screenshot hooks/renderers (html2canvas + dom-to-image)
- Selector discovery
- Screenshot pre-hooks (`scrollIntoView`, `waitForSelector`, custom scripts)
- Auto-reconnect with exponential backoff and stored-session resume

## Storage & Status Adapters

- **Storage** – provide your own adapter (sessionStorage, IndexedDB, cookies) by implementing the `SweetLinkStorageAdapter` interface. The built-in `createSessionStorageAdapter()` mirrors the Sweetistics behaviour and enforces the expiry safety margin.
- **Status** – pass callbacks/listeners via the `status` option to mirror connection state in your UI. The runtime already emits `CustomEvent('sweetlink:status')`; hook that if you prefer DOM events over direct callbacks.

## Handshake Endpoint

The runtime only needs a POST endpoint that returns `{ sessionId, sessionToken, socketUrl, expiresAt }`. In Next.js you can reuse `@sweetlink/shared` helpers to mint tokens:

```ts
import {
  createSweetLinkSessionId,
  SWEETLINK_SESSION_EXP_SECONDS,
  signSweetLinkToken,
} from '@sweetlink/shared';

export async function POST() {
  const sessionId = createSweetLinkSessionId();
  const token = signSweetLinkToken({ secret, sessionId, scope: 'session', ttlSeconds: SWEETLINK_SESSION_EXP_SECONDS });

  return NextResponse.json({
    sessionId,
    sessionToken: token,
    socketUrl: process.env.SWEETLINK_DAEMON_URL ?? 'https://localhost:4455',
    expiresAt: Date.now() + SWEETLINK_SESSION_EXP_SECONDS * 1000,
  });
}
```

## Testing Helpers

Import `sweetLinkBrowserTestHelpers` for unit tests:

```ts
import { sweetLinkBrowserTestHelpers } from 'sweetlink/runtime/browser';

const { createHookRunner, stripDataUrlPrefix, commandSelectorSummary } = sweetLinkBrowserTestHelpers;
```

These match the helpers that previously lived under `__sweetlinkTestApi`, so existing tests can continue to stub/snapshot screenshot helpers without poking private module scope.

## When To Use The Runtime

- Building your own dashboard that needs “Enable SweetLink” without copying 1.5k LOC.
- Shipping SweetLink integration in extensions/desktop shells that lean on shared React code.
- Writing automated demos where the CLI starts a session and your web app lazily connects.

When you need lower-level access (custom renderers, alternative screenshot transports), use the public `sweetlink/runtime/browser` export rather than private submodules.
