# SweetLink Daemon (Internal)

This workspace holds the daemon implementation that ships with the published `sweetlink` package. It is bundled into the CLI tarball and is not published separately.

Developers can run it locally via `pnpm sweetlink:daemon` or by importing from `../daemon/src` while working inside the monorepo.

When a browser reconnects with the same session ID, the new socket takes over and interrupted commands fail promptly. Re-registering on the same socket preserves pending commands. Expired sessions reject pending commands before disconnecting; messages from replaced or unregistered sockets are ignored.
