export function isDaemonHelpRequest(args) {
    return args.includes("--help") || args.includes("-h");
}
export function formatDaemonHelp() {
    return [
        "Usage: sweetlinkd [options]",
        "",
        "Launch the SweetLink daemon process",
        "",
        "Options:",
        "  -h, --help  display help for command",
    ].join("\n");
}
//# sourceMappingURL=cli.js.map