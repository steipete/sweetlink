import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
const DEFAULT_MKCERT_PATH = 'mkcert';
const MKCERT_INSTALL_ARGS = ['-install'];
async function resolveMkcertBinary(candidate) {
    const bin = candidate?.trim() ?? DEFAULT_MKCERT_PATH;
    if (path.isAbsolute(bin)) {
        await access(bin);
        return bin;
    }
    return bin;
}
export function registerTrustCaCommand(program) {
    program
        .command('trust-ca')
        .description([
        'Install or refresh the SweetLink TLS certificate.',
        'Runs `mkcert -install` so browsers and the daemon share the same trusted CA.',
    ].join(' '))
        .option('--mkcert <path>', 'Explicit path to the mkcert binary')
        .action(async (options) => {
        const mkcertBinary = await resolveMkcertBinary(options.mkcert);
        await new Promise((resolve, reject) => {
            const child = spawn(mkcertBinary, MKCERT_INSTALL_ARGS, {
                stdio: 'inherit',
            });
            child.on('exit', (code) => {
                if (code === 0) {
                    resolve();
                    return;
                }
                reject(new Error(`mkcert exited with code ${code ?? 'unknown'}. Ensure mkcert is installed (https://github.com/FiloSottile/mkcert) and rerun this command.`));
            });
            child.on('error', (error) => {
                reject(new Error(`Unable to execute mkcert at "${mkcertBinary}": ${error instanceof Error ? error.message : String(error)}`));
            });
        });
        // eslint-disable-next-line no-console -- CLI feedback for operators
        console.log('✅ SweetLink certificate installed. Reload https://localhost:4455 in your browser to trust the daemon.');
    });
}
//# sourceMappingURL=trust-ca.js.map