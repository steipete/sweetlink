export function isDaemonHelpRequest(args: readonly string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

export function formatDaemonHelp(): string {
  return [
    "Usage: sweetlinkd [options]",
    "",
    "Launch the SweetLink daemon process",
    "",
    "Options:",
    "  -h, --help  display help for command",
  ].join("\n");
}
