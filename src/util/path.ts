import os from "node:os";

/** Collapses the current home directory so paths read cleanly in logs. */
export function formatPathForDisplay(value: string): string {
  return value.replace(os.homedir(), "~");
}
