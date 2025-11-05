import { type SpawnOptions, spawn } from 'node:child_process';
import type { SweetLinkConsoleDump } from './runtime/session';
import { describeAppForPrompt } from './util/app-label';
import { extractEventMessage, isErrnoException } from './util/errors';

const CODEX_ARGS = ['exec', '--yolo', '--skip-git-repo-check'];

/** Invokes the Codex CLI with optional stdin. */
async function runCodexExec(args: string[], options: { stdin?: string } = {}): Promise<number> {
  const stdio: SpawnOptions['stdio'] = options.stdin
    ? ['pipe', 'inherit', 'inherit']
    : ['inherit', 'inherit', 'inherit'];
  const child = spawn('codex', [...CODEX_ARGS, ...args], { stdio });
  return await new Promise((resolve, reject) => {
    child.once('error', (error) => reject(error));
    child.once('close', (code) => resolve(code ?? 0));
    if (options.stdin) {
      const payload = options.stdin.endsWith('\n') ? options.stdin : `${options.stdin}\n`;
      child.stdin?.write(payload);
      child.stdin?.end();
    }
  });
}

/** Asks Codex about a screenshot file. */
export async function runCodexImagePrompt(imagePath: string, prompt: string): Promise<number> {
  const payload = prompt.endsWith('\n') ? prompt : `${prompt}\n`;
  return runCodexExec(['-i', imagePath, '-'], { stdin: payload });
}

/** Asks Codex about a text payload. */
export async function runCodexTextPrompt(prompt: string): Promise<number> {
  return runCodexExec([prompt]);
}

/** Helper for summarising console dumps via Codex. */
export async function analyzeConsoleWithCodex(
  selector: string,
  prompt: string,
  events: SweetLinkConsoleDump[],
  options: { silent?: boolean; appLabel?: string } = {}
): Promise<boolean> {
  const question = prompt.trim();
  if (!question) {
    return false;
  }
  const lines =
    events.length > 0
      ? events.map((event) => {
          const timestamp = new Date(event.timestamp ?? Date.now()).toLocaleTimeString();
          const args = Array.isArray(event.args) ? event.args.map(String).join(' ') : '';
          const suffix = args.length > 0 ? `: ${args}` : '';
          return `[${timestamp}] ${event.level}${suffix}`;
        })
      : ['(no console events were captured after the click)'];
  const appDescription = describeAppForPrompt(options.appLabel);
  const combinedPrompt =
    `You are analyzing console output from ${appDescription} immediately after triggering a click on selector "${selector}". ` +
    'Review the log lines below (most recent last) and answer the agent’s question.\n\n' +
    `Console output:\n${lines.join('\n')}\n\nQuestion: ${question}`;
  if (!options.silent) {
    console.log(`Asking Codex about console output after ${selector}: ${question}`);
  }
  try {
    const exitCode = await runCodexTextPrompt(combinedPrompt);
    if (exitCode !== 0) {
      console.warn(`Codex exited with status ${exitCode}.`);
      return false;
    }
    return true;
  } catch (error) {
    const message = extractEventMessage(error);
    const missing = isErrnoException(error) && error.code === 'ENOENT';
    const prefix = missing ? 'Codex CLI not found' : `Codex CLI failed: ${message}`;
    console.warn(missing ? `${prefix}; install it or add it to $PATH to use --prompt.` : prefix);
    return false;
  }
}
