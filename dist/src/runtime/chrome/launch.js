import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cliEnv } from '../../env.js';
import { saveDevToolsConfig } from '../devtools.js';
import { primeControlledChromeCookies } from './cookies.js';
import { findAvailablePort } from './reuse.js';
const DEFAULT_MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export async function launchChrome(target, options = {}) {
    const chromePath = cliEnv.chromePath ?? DEFAULT_MAC_CHROME;
    if (!existsSync(chromePath)) {
        throw new Error(`Google Chrome is required but was not found at "${chromePath}". Set SWEETLINK_CHROME_PATH to override the location.`);
    }
    const background = process.platform === 'darwin' && options.foreground !== true;
    await spawnChromeDetached(chromePath, ['--new-tab', target], { background });
}
export async function launchControlledChrome(target, options) {
    const chromePath = cliEnv.chromePath ?? DEFAULT_MAC_CHROME;
    if (!existsSync(chromePath)) {
        throw new Error(`Google Chrome is required but was not found at "${chromePath}". Set SWEETLINK_CHROME_PATH to override the location.`);
    }
    const port = options.port && !Number.isNaN(options.port) ? options.port : await findAvailablePort();
    const userDataDirectory = path.join(os.tmpdir(), `sweetlink-chrome-${port}-${Date.now()}`);
    mkdirSync(userDataDirectory, { recursive: true });
    const args = [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDirectory}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-renderer-backgrounding',
        '--allow-insecure-localhost',
        '--new-window',
        target,
    ];
    if (options.headless) {
        args.push('--headless=new', '--disable-gpu', '--hide-scrollbars');
    }
    const background = process.platform === 'darwin' && options.foreground !== true;
    await spawnChromeDetached(chromePath, args, { background });
    const devtoolsUrl = `http://127.0.0.1:${port}`;
    await saveDevToolsConfig({
        devtoolsUrl,
        port,
        userDataDir: userDataDirectory,
        updatedAt: Date.now(),
        targetUrl: target,
    }).catch((error) => {
        console.warn('Failed to persist DevTools config:', error);
    });
    if (options.cookieSync) {
        await primeControlledChromeCookies({
            devtoolsUrl,
            targetUrl: target,
            reload: true,
            context: 'new-window',
        });
    }
    return { port, userDataDir: userDataDirectory, devtoolsUrl };
}
export function prepareChromeLaunch(platform, chromePath, chromeArgs, options = {}) {
    const background = Boolean(options.background);
    if (platform === 'darwin' && background) {
        const appTarget = deriveMacChromeApplication(chromePath) ?? 'Google Chrome';
        const args = ['-g', '-n', '-a', appTarget];
        if (chromeArgs.length > 0) {
            args.push('--args', ...chromeArgs);
        }
        return { command: 'open', args };
    }
    return { command: chromePath, args: chromeArgs };
}
export async function spawnChromeDetached(chromePath, chromeArgs, options = {}) {
    const spec = prepareChromeLaunch(process.platform, chromePath, chromeArgs, options);
    await new Promise((resolve, reject) => {
        const child = spawn(spec.command, spec.args, {
            detached: true,
            stdio: 'ignore',
        });
        child.once('error', (error) => reject(error));
        child.once('spawn', () => {
            child.unref();
            resolve();
        });
    });
}
function deriveMacChromeApplication(chromePath) {
    let candidate = chromePath;
    for (let depth = 0; depth < 4; depth += 1) {
        if (candidate.endsWith('.app')) {
            return candidate;
        }
        const parent = path.dirname(candidate);
        if (parent === candidate) {
            break;
        }
        candidate = parent;
    }
    return null;
}
//# sourceMappingURL=launch.js.map