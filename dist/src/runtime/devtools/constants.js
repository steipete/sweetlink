import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const DEVTOOLS_CONFIG_PATH = path.join(os.homedir(), '.sweetlink', 'devtools.json');
export const DEVTOOLS_STATE_PATH = path.join(os.homedir(), '.sweetlink', 'devtools-state.json');
export const DEVTOOLS_LISTENER_PID_PATH = path.join(os.homedir(), '.sweetlink', 'devtools-listener.pid');
export const DEVTOOLS_CONSOLE_LIMIT = 500;
export const DEVTOOLS_NETWORK_LIMIT = 500;
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
export const DEFAULT_CLI_ENTRYPOINT = path.join(moduleDirname, '..', 'index.ts');
export const PUPPETEER_CONNECT_TIMEOUT_MS = 45_000;
export const BENIGN_CONSOLE_TYPES = new Set(['log', 'info', 'debug', 'dir', 'dirxml', 'trace', 'table']);
export const IGNORABLE_DIAGNOSTIC_MESSAGES = [
    'Intentional break for SweetLink session test',
    'Intentional failure for SweetLink diagnostics test',
];
//# sourceMappingURL=constants.js.map