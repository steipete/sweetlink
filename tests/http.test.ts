import { regex } from "arkregex";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSIONS_HINT_PATTERN = regex.as("Hint: run `pnpm sweetlink sessions`");
const ECONNRESET_PATTERN = regex.as(
  String.raw`cause: \{ errno: 'ECONNRESET', code: 'ECONNRESET' \}`,
);

const fetchMock = vi.fn();
// @ts-expect-error override global fetch for tests
global.fetch = fetchMock;

const { fetchJson } = await import("../../src/http");

describe("fetchJson", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("returns parsed JSON when the response succeeds", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    });

    await expect(fetchJson<{ ok: boolean }>("https://api.example.dev/data")).resolves.toEqual({
      ok: true,
    });
  });

  it("throws enriched errors when the response is not ok", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({ error: "Missing" }),
    });

    await expect(fetchJson("https://api.example.dev/missing")).rejects.toThrow(
      'Request failed: {"error":"Missing"}',
    );
  });

  it("appends diagnostic hints when fetch rejects with session errors", async () => {
    const networkError = new Error("Session not found or offline");
    (networkError as Error).cause = new Error("ECONNREFUSED");
    fetchMock.mockRejectedValueOnce(networkError);

    await expect(fetchJson("https://api.example.dev/fail")).rejects.toThrow(SESSIONS_HINT_PATTERN);
  });

  it("falls back to status text when the error payload is not JSON", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Server Error",
      json: () => {
        throw new Error("invalid json");
      },
    });

    await expect(fetchJson("https://api.example.dev/broken")).rejects.toThrow(
      "Request failed: 500 Server Error",
    );
  });

  it("serializes unknown cause values for easier debugging", async () => {
    const error = new Error("Socket hang up");
    (error as Error & { cause?: unknown }).cause = { errno: "ECONNRESET", code: "ECONNRESET" };
    fetchMock.mockRejectedValueOnce(error);

    await expect(fetchJson("https://api.example.dev/cause")).rejects.toThrow(ECONNRESET_PATTERN);
  });
});
