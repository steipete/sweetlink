import { describe, expect, it } from "vitest";
import { formatDaemonHelp, isDaemonHelpRequest } from "../daemon/src/cli";

describe("daemon CLI metadata", () => {
  it("recognizes both help flags", () => {
    expect(isDaemonHelpRequest(["--help"])).toBe(true);
    expect(isDaemonHelpRequest(["-h"])).toBe(true);
  });

  it("leaves ordinary daemon arguments alone", () => {
    expect(isDaemonHelpRequest([])).toBe(false);
    expect(isDaemonHelpRequest(["--port", "4456"])).toBe(false);
  });

  it("describes the standalone daemon entrypoint", () => {
    expect(formatDaemonHelp()).toContain("Usage: sweetlinkd [options]");
    expect(formatDaemonHelp()).toContain("-h, --help");
  });
});
