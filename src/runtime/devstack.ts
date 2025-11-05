import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compact } from 'es-toolkit';
import { Agent, setGlobalDispatcher } from 'undici';
import { cliEnv, sweetLinkDebug } from '../env';
import type { ServerConfig } from '../types';
import { extractEventMessage } from '../util/errors';
import { formatPathForDisplay } from '../util/path';
import { delay } from '../util/time';

/** Registers the mkcert CA with undici so HTTPS requests succeed without NODE_TLS_REJECT_UNAUTHORIZED hacks. */
export function maybeInstallMkcertDispatcher(): void {
  const overridePath = cliEnv.caPath ?? null;
  const mkcertRoot = cliEnv.caRoot ?? path.join(os.homedir(), 'Library', 'Application Support', 'mkcert');
  const candidates = [
    overridePath,
    path.join(mkcertRoot, 'rootCA.pem'),
    path.join(os.homedir(), '.sweetlink', 'certs', 'localhost-cert.pem'),
  ].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0);

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }
    try {
      const ca = readFileSync(candidate);
      setGlobalDispatcher(new Agent({ connect: { ca } }));
      if (sweetLinkDebug) {
        console.info(`configured mkcert CA from ${formatPathForDisplay(candidate)}`);
      }
      return;
    } catch (error) {
      console.warn(`Failed to register SweetLink TLS CA from ${formatPathForDisplay(candidate)}:`, error);
    }
  }
}

interface EnsureDevStackOptions {
  readonly repoRoot: string;
  readonly healthPaths?: readonly string[];
  readonly server?: ServerConfig;
}

/** Ensures the local dev server is online, optionally attempting to start it via configured command. */
export async function ensureDevStackRunning(targetUrl: URL, options: EnsureDevStackOptions): Promise<void> {
  const appOrigin = targetUrl.origin;
  const checkTimeout = options.server?.timeoutMs ?? 30_000;

  const isHealthy = async (): Promise<boolean> => {
    if (options.server?.check) {
      const ok = await runCheckCommand(options.server, options.repoRoot);
      if (ok) {
        return true;
      }
    }
    return await isAppReachable(appOrigin, options.healthPaths);
  };

  if (await isHealthy()) {
    return;
  }

  if (options.server?.start) {
    console.log('Detected dev stack offline. Running configured start command…');
    try {
      launchStartCommand(options.server, options.repoRoot);
    } catch (error) {
      console.warn('Failed to launch dev stack automatically:', extractEventMessage(error));
    }
  } else {
    console.warn('Dev stack appears offline and no start command is configured. Start it manually.');
    return;
  }

  const deadline = Date.now() + checkTimeout;
  while (Date.now() < deadline) {
    if (await isHealthy()) {
      console.log('Dev stack is online.');
      return;
    }
    await delay(1000);
  }

  console.warn(
    `Dev stack did not become ready within ${Math.round(checkTimeout / 1000)}s. Expect follow-up commands to fail until the server finishes booting.`
  );
}

/** Performs lightweight HEAD requests to confirm the web app responds. */
export async function isAppReachable(appBaseUrl: string, healthPaths?: readonly string[]): Promise<boolean> {
  const additionalTargets = compact(
    (healthPaths ?? []).map((pathCandidate) => {
      if (typeof pathCandidate !== 'string') {
        return null;
      }
      const trimmed = pathCandidate.trim();
      if (trimmed.length === 0) {
        return null;
      }
      try {
        const target = trimmed.startsWith('http')
          ? new URL(trimmed)
          : new URL(trimmed.startsWith('/') ? trimmed : `/${trimmed}`, appBaseUrl);
        return target.toString();
      } catch {
        return null;
      }
    })
  );
  const targets = new Set<string>([appBaseUrl, ...additionalTargets]);

  for (const target of targets) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      try {
        await fetch(target, { method: 'HEAD', redirect: 'manual', signal: controller.signal });
        return true;
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const message = extractEventMessage(error);
      const isAbort = (error as { name?: string }).name === 'AbortError';
      if (
        !message.includes('ECONNREFUSED') &&
        !message.includes('ENOTFOUND') &&
        !message.includes('EHOSTUNREACH') &&
        !isAbort
      ) {
        return false;
      }
    }
  }

  return false;
}

async function runCheckCommand(server: ServerConfig, repoRoot: string): Promise<boolean> {
  const checkArgs = server.check;
  if (!checkArgs || checkArgs.length === 0) {
    return false;
  }
  const command = checkArgs[0];
  if (!command) {
    return false;
  }
  const args = checkArgs.slice(1);
  const cwd = server.cwd ?? repoRoot;
  return await new Promise<boolean>((resolve) => {
    try {
      const child: ChildProcess = spawn(command, args, {
        cwd,
        stdio: 'ignore',
      });
      const timer = setTimeout(() => {
        child.kill();
        resolve(false);
      }, 5000);
      child.once('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
      child.once('close', (code: number | null) => {
        clearTimeout(timer);
        resolve(code === 0);
      });
    } catch {
      resolve(false);
    }
  });
}

function launchStartCommand(server: ServerConfig, repoRoot: string): void {
  const startArgs = server.start;
  if (!startArgs || startArgs.length === 0) {
    return;
  }
  const command = startArgs[0];
  if (!command) {
    return;
  }
  const args = startArgs.slice(1);
  const cwd = server.cwd ?? repoRoot;
  const child: ChildProcess = spawn(command, args, {
    cwd,
    stdio: sweetLinkDebug ? 'inherit' : 'ignore',
    detached: true,
  });
  child.unref();
}
