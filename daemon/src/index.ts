#!/usr/bin/env node

import { formatDaemonHelp, isDaemonHelpRequest } from "./cli.js";
import { runDaemon } from "./server.js";

if (isDaemonHelpRequest(process.argv.slice(2))) {
  console.log(formatDaemonHelp());
} else {
  await runDaemon();
}
