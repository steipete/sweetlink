import { regex } from "arkregex";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SCOPE_MISMATCH_PATTERN = regex.as("scope mismatch");
const TOKEN_EXPIRED_PATTERN = regex.as("expired");

import {
  createSweetLinkCommandId,
  createSweetLinkSessionId,
  SWEETLINK_CLI_EXP_SECONDS,
  SWEETLINK_SESSION_EXP_SECONDS,
  signSweetLinkToken,
  verifySweetLinkToken,
} from "../../shared/src/index";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("SweetLink token helpers", () => {
  it("signs and verifies CLI tokens end-to-end", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    const token = signSweetLinkToken({
      secret: "super-secret-value-1234567890",
      scope: "cli",
      subject: "user-123",
      sessionId: "session-abc",
      ttlSeconds: SWEETLINK_CLI_EXP_SECONDS,
    });

    const decoded = verifySweetLinkToken({
      secret: "super-secret-value-1234567890",
      token,
      expectedScope: "cli",
    });

    expect(decoded).toMatchObject({
      scope: "cli",
      sub: "user-123",
      sessionId: "session-abc",
      expiresAt: decoded.issuedAt + SWEETLINK_CLI_EXP_SECONDS,
    });
  });

  it("rejects tokens when the scope or expiration does not match expectations", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const token = signSweetLinkToken({
      secret: "another-secret-value-0987654321",
      scope: "session",
      subject: "user-456",
      sessionId: "session-def",
      ttlSeconds: SWEETLINK_SESSION_EXP_SECONDS,
    });

    // Scope mismatch
    expect(() =>
      verifySweetLinkToken({
        secret: "another-secret-value-0987654321",
        token,
        expectedScope: "cli",
      }),
    ).toThrow(SCOPE_MISMATCH_PATTERN);

    // Expired token check.
    vi.spyOn(Date, "now").mockReturnValue(
      1_700_000_000_000 + (SWEETLINK_SESSION_EXP_SECONDS + 30) * 1000,
    );
    expect(() =>
      verifySweetLinkToken({
        secret: "another-secret-value-0987654321",
        token,
        expectedScope: "session",
      }),
    ).toThrow(TOKEN_EXPIRED_PATTERN);
  });

  it("generates unique IDs for sessions and commands", () => {
    const sessionIds = new Set([createSweetLinkSessionId(), createSweetLinkSessionId()]);
    const commandIds = new Set([createSweetLinkCommandId(), createSweetLinkCommandId()]);
    expect(sessionIds.size).toBe(2);
    expect(commandIds.size).toBe(2);
  });
});
