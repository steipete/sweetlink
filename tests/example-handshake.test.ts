import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "../examples/basic-web/server/csp.js";
import { resolveSocketUrl } from "../examples/basic-web/server/handshake.js";

describe("basic web example handshake", () => {
  it.each([
    ["https://localhost:4455", "wss://localhost:4455/bridge"],
    ["http://localhost:4455", "ws://localhost:4455/bridge"],
    ["wss://daemon.example.test/base?debug=1", "wss://daemon.example.test/bridge"],
    ["ws://daemon.example.test/base#fragment", "ws://daemon.example.test/bridge"],
  ])("maps daemon URL %s to browser WebSocket URL %s", (daemonUrl, expected) => {
    expect(resolveSocketUrl(daemonUrl)).toBe(expected);
  });

  it("rejects protocols that WebSocket cannot use", () => {
    expect(() => resolveSocketUrl("ftp://daemon.example.test")).toThrow(
      "Unsupported SweetLink daemon protocol: ftp:",
    );
  });

  it("allows only the configured daemon WebSocket origin through CSP", () => {
    expect(buildContentSecurityPolicy("https://daemon.example.test:4455")).toBe(
      "default-src 'self' 'unsafe-inline' 'unsafe-eval'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; connect-src 'self' wss://daemon.example.test:4455",
    );
  });
});
