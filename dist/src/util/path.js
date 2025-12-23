import os from 'node:os';
/** Collapses the current home directory so paths read cleanly in logs. */
export function formatPathForDisplay(value) {
    return value.replace(os.homedir(), '~');
}
//# sourceMappingURL=path.js.map