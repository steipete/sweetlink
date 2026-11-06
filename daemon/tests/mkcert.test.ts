import { describe, expect, it } from "vitest";
import { mkcertMissingFromProbe } from "../src/server.js";

describe("mkcert lookup", () => {
  it("treats a missing command as unavailable", () => {
    expect(mkcertMissingFromProbe({ status: null, error: { code: "ENOENT" } })).toBe(true);
  });

  it("treats a version probe that exits 0 as available", () => {
    expect(mkcertMissingFromProbe({ status: 0 })).toBe(false);
  });

  it("treats a failed version probe as unavailable", () => {
    expect(mkcertMissingFromProbe({ status: 1 })).toBe(true);
  });
});
