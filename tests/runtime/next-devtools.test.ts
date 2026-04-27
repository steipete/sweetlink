import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchNextDevtoolsErrors } from "../../src/runtime/next-devtools";

describe("fetchNextDevtoolsErrors", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses SSE payloads from the Next.js MCP endpoint", async () => {
    const ssePayload = [
      "event: message",
      'data: {"result":{"content":[{"type":"text","text":"**Error**: boom\\n``\\nstack\\n``"}]},"jsonrpc":"2.0","id":"1"}',
      "",
    ].join("\n");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(ssePayload),
    });
    globalThis.fetch = fetchMock;

    const summary = await fetchNextDevtoolsErrors("http://localhost:3000/timeline");

    expect(summary).toContain("Error");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/_next/mcp",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("returns null when the endpoint does not provide SSE output", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("event: noop"),
    });

    const summary = await fetchNextDevtoolsErrors("http://localhost:3000/timeline");

    expect(summary).toBeNull();
  });
});
