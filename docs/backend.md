---
summary: 'Server-side responsibilities for hosting SweetLink: handshake routes, daemon configuration, and security considerations.'
---

# Backend Integration

SweetLink’s CLI and browser runtime take care of the client-side plumbing. Hosting SweetLink inside your product only requires a couple of backend touchpoints:

1. **Handshake endpoint** – mint short-lived session tokens for authenticated users/operators.
2. **Daemon coordination** – run the `sweetlink` daemon somewhere reachable (local dev, remote VM, or a shared host) and expose its websocket URL to handshakes.
3. **Security guardrails** – decide which users can request sessions and how long those sessions should last.
4. **Dev ergonomics** – optionally expose a TLS status probe or admin telemetry so operators know whether the daemon is reachable.

This guide covers each piece with practical snippets you can adapt to any framework.

## Handshake Endpoint

The browser runtime expects a `POST` endpoint that returns `{ sessionId, sessionToken, socketUrl, expiresAt }`. The CLI uses the same shape when it calls `/api/admin/sweetlink/remote-handshake`.

```ts
// app/api/admin/sweetlink/remote-handshake/route.ts
import {
  createSweetLinkSessionId,
  signSweetLinkToken,
  SWEETLINK_SESSION_EXP_SECONDS,
} from '@sweetlink/shared';
import { resolveSweetLinkSecret } from '@sweetlink/shared/node';
import { NextResponse } from 'next/server';

export async function POST() {
  // 1. Authorize the caller. Example: check user roles, API keys, or session cookies here.
  // const session = await requireAdmin(request);

  // 2. Resolve a shared secret. In dev you can auto-create it, in prod load from a vault/secret store.
  const { secret } = await resolveSweetLinkSecret({ autoCreate: !process.env.NEXT_PUBLIC_IS_PROD });

  // 3. Allocate a session id + signed token.
  const sessionId = createSweetLinkSessionId();
  const sessionToken = signSweetLinkToken({
    secret,
    sessionId,
    scope: 'session',
    subject: 'sweetlink-web',
    ttlSeconds: SWEETLINK_SESSION_EXP_SECONDS,
  });

  // 4. Return the websocket URL (usually your daemon host) plus the optional expiry for caching.
  return NextResponse.json({
    sessionId,
    sessionToken,
    socketUrl: process.env.SWEETLINK_DAEMON_URL ?? 'https://localhost:4455/bridge',
    expiresAt: Date.now() + SWEETLINK_SESSION_EXP_SECONDS * 1000,
  });
}
```

**Key details**

- The browser never stores your admin key. Instead it supplies the short-lived `sessionToken` in the websocket `register` message.
- `expiresAt` is optional but helps the client decide whether a cached session is still valid. SweetLink automatically subtracts a small safety margin before trying to resume.
- Scope the `subject` so you can distinguish browser vs. CLI tokens in your daemon logs/security tooling.

## Secret Management

The daemon and your handshake route must agree on a shared secret used to sign session tokens. Pick the strategy that fits your environment:

| Mode | Recommended Flow |
| --- | --- |
| Local development | Call `resolveSweetLinkSecret({ autoCreate: true })` (shipped in `@sweetlink/shared/node`). It stores a random key in `~/.sweetlink/secret.key` so CLI, backend, and example apps can share it. |
| CI / remote daemon | Inject a secret via an env var (`SWEETLINK_SECRET`). Rotate it the same way you would any other API key. |
| Hosted daemon per team | Store secrets in your vault (AWS Secrets Manager, Doppler, 1Password) and read them in both the daemon process and the handshake route. |

If you run multiple daemons (e.g., different environments), prefer scoped secrets per daemon so leaked tokens cannot be replayed elsewhere.

## Daemon Reachability & TLS

Operators need to know whether the daemon is online and whether the browser trusts its certificate. The basic web example ships a `/api/sweetlink/status` probe that:

1. Sends an HTTPS `HEAD` request to the daemon URL.
2. Marks the daemon as `reachable + tlsTrusted` if the request succeeds with a trusted cert.
3. Marks it as `reachable + tlsTrusted=false` when the daemon responds but presents an untrusted cert (common when mkcert isn’t trusted yet).
4. Marks it as `reachable=false` when the connection fails.

Expose a similar endpoint (or fold it into your existing health checks) so your UI can disable “Enable SweetLink” until everything is ready. SweetLink’s CLI also prints TLS instructions during `pnpm sweetlink open`, but surfacing it in-app saves time for operators.

## Browser Runtime Recap

Once the backend endpoint exists, the browser can import the runtime directly:

```ts
import { createSweetLinkClient, createSessionStorageAdapter } from 'sweetlink/runtime/browser';

const sweetLinkClient = createSweetLinkClient({
  storage: createSessionStorageAdapter(),
  status: {
    onStatusSnapshot: (snapshot) => setSweetLinkStatus(snapshot),
  },
  autoReconnectHandshake: () =>
    fetch('/api/admin/sweetlink/remote-handshake', { method: 'POST' }).then((res) => res.json()),
});
```

The runtime handles:

- WebSocket registration + heartbeats
- Command dispatch (runScript, navigate, screenshot, selector discovery, ping)
- Console buffering and throttled flushes
- Auto-reconnect with exponential backoff and stored-session resume

See [`examples/basic-web`](../examples/basic-web/README.md) for a complete working example that uses this runtime and the status probe above.

## Security Checklist

- **Authenticate callers** – never allow anonymous access to the handshake route. Gate it behind your admin menu, API key, or operator auth.
- **Limit TTLs** – 5–10 minutes is plenty. Renew tokens when the CLI/browser reconnects instead of issuing multi-hour handshakes.
- **Log handshakes** – capture who requested each session (user id, codename, timestamp). This makes auditing CLI activity straightforward.
- **Avoid leaking codename/sessionId** – the runtime only surfaces codename in the UI for convenience. Treat the IDs like short-lived secrets and don’t expose them to untrusted users.

With those pieces in place, you can reuse the exact flow Sweetistics runs internally: the CLI requests a handshake, the browser runtime registers with the daemon, and both ends keep console/network telemetry flowing until the session ends.
