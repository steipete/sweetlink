import { once } from "node:events";
import { describe, expect, it } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import { signSweetLinkToken } from "../../shared/src/index.js";
import { SweetLinkState } from "../src/server.js";

const secret = "sweetlink-loopback-test-secret";

describe("session replacement over WebSocket", () => {
  it("keeps routing commands after the old connection closes", async () => {
    const state = new SweetLinkState(secret);
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    server.on("connection", (socket) => state.handleSocket(socket));
    const clients: WebSocket[] = [];
    try {
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing test server port");
      const register = async (socket: WebSocket) => {
        await once(socket, "open");
        const metadata = once(socket, "message");
        socket.send(
          JSON.stringify({
            kind: "register",
            sessionId: "loopback-session",
            token: signSweetLinkToken({
              secret,
              scope: "session",
              subject: "browser",
              ttlSeconds: 60,
              sessionId: "loopback-session",
            }),
            url: "https://example.test",
            title: "Synthetic test",
            userAgent: "test",
            topOrigin: "https://example.test",
          }),
        );
        await metadata;
      };
      const first = new WebSocket(`ws://127.0.0.1:${address.port}`);
      clients.push(first);
      await register(first);
      const interrupted = state
        .sendCommand("loopback-session", { type: "ping" })
        .catch((error: Error) => error);
      const oldClosed = once(first, "close");
      const second = new WebSocket(`ws://127.0.0.1:${address.port}`);
      clients.push(second);
      await register(second);
      await oldClosed;
      expect(((await interrupted) as Error).message).toMatch(/replaced by a new socket/);
      expect(state.listSessions()).toHaveLength(1);
      const commandMessage = once(second, "message");
      const completed = state.sendCommand("loopback-session", { type: "ping" });
      const [payload] = await commandMessage;
      const message = JSON.parse(String(payload)) as { command: { id: string } };
      second.send(
        JSON.stringify({
          kind: "commandResult",
          sessionId: "loopback-session",
          result: { ok: true, commandId: message.command.id, durationMs: 1, data: "pong" },
        }),
      );
      await expect(completed).resolves.toMatchObject({ data: "pong" });
    } finally {
      for (const client of clients) client.terminate();
      for (const client of server.clients) client.terminate();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
