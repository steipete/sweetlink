import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cloneProcessEnv, readLocalEnvString } from '../../core/env.js';
import { sweetLinkDebug } from '../../env.js';
import { isErrnoException } from '../../util/errors.js';
import { DEFAULT_CLI_ENTRYPOINT, DEVTOOLS_LISTENER_PID_PATH } from './constants.js';
export async function ensureBackgroundDevtoolsListener(params) {
    const disableAutoListener = readLocalEnvString('SWEETLINK_DISABLE_AUTO_DEVTOOLS') === '1';
    if (disableAutoListener) {
        return;
    }
    try {
        const existingPid = await readDevToolsListenerPid();
        if (existingPid && isProcessAlive(existingPid)) {
            return;
        }
        if (existingPid) {
            await clearDevToolsListenerPid();
        }
        const sessionArgs = [];
        if (params.sessionId && params.sessionId.trim().length > 0) {
            sessionArgs.push('--session', params.sessionId.trim());
        }
        const child = spawnBackgroundListener(sessionArgs);
        child.once('error', (error) => {
            if (sweetLinkDebug) {
                console.warn('Background DevTools listener process failed:', error);
            }
        });
        const childPid = child.pid;
        child.unref();
        if (childPid) {
            await writeDevToolsListenerPid(childPid);
            if (!params.quiet) {
                console.log(`Started background DevTools listener (pid ${childPid}).`);
            }
        }
    }
    catch (error) {
        if (sweetLinkDebug) {
            console.warn('Failed to launch background DevTools listener:', error);
        }
    }
}
async function readDevToolsListenerPid() {
    try {
        const raw = await readFile(DEVTOOLS_LISTENER_PID_PATH, 'utf8');
        const parsed = Number.parseInt(raw.trim(), 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
        return null;
    }
    catch (error) {
        if (isErrnoException(error) && error.code === 'ENOENT') {
            return null;
        }
        if (sweetLinkDebug) {
            console.warn('Failed to read DevTools listener pid file:', error);
        }
        return null;
    }
}
async function writeDevToolsListenerPid(pid) {
    if (!Number.isFinite(pid) || pid <= 0) {
        return;
    }
    const directory = path.dirname(DEVTOOLS_LISTENER_PID_PATH);
    await mkdir(directory, { recursive: true });
    await writeFile(DEVTOOLS_LISTENER_PID_PATH, `${pid}\n`, 'utf8');
}
async function clearDevToolsListenerPid() {
    try {
        await rm(DEVTOOLS_LISTENER_PID_PATH, { force: true });
    }
    catch (error) {
        if (isErrnoException(error) && error.code === 'ENOENT') {
            return;
        }
        if (sweetLinkDebug) {
            console.warn('Failed to clear DevTools listener pid file:', error);
        }
    }
}
function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        const errno = error;
        if (errno && errno.code === 'EPERM') {
            return true;
        }
        return false;
    }
}
function spawnBackgroundListener(sessionArgs) {
    const env = cloneProcessEnv();
    env.SWEETLINK_DEVTOOLS_BACKGROUND = '1';
    const entrypoint = process.argv[1] ?? DEFAULT_CLI_ENTRYPOINT;
    return spawn(process.execPath, ['--loader', 'tsx', entrypoint, 'devtools', 'listen', '--background', ...sessionArgs], {
        detached: true,
        stdio: 'ignore',
        env,
    });
}
//# sourceMappingURL=background.js.map