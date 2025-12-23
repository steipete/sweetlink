import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { inspect } from 'node:util';
import { sweetLinkDebug } from '../env.js';
/** Resolve inline or file-based JavaScript payloads for run-js commands. */
export async function resolveScript(options, inline) {
    if (options.file) {
        const fileContents = await readFile(options.file, 'utf8');
        return fileContents.toString();
    }
    if (options.code && options.code.length > 0) {
        return options.code.join(' ');
    }
    if (inline?.length) {
        return inline.join(' ');
    }
    throw new Error('Provide JavaScript inline (e.g. `pnpm sweetlink run-js <id> "console.log(1)"`) or use --code/--file to supply a script.');
}
/** Loads an optional beforeScript snippet for screenshot hooks. */
export async function resolveHookSnippet(value) {
    if (!value) {
        return null;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return null;
    }
    if (trimmed.startsWith('@')) {
        const candidatePath = trimmed.slice(1).trim();
        if (!candidatePath) {
            throw new Error('Expected a file path after @ for --before-script.');
        }
        const absolute = path.isAbsolute(candidatePath) ? candidatePath : path.resolve(candidatePath);
        const hookContents = await readFile(absolute, 'utf8');
        return hookContents.toString();
    }
    if (trimmed.startsWith('file://')) {
        const filePath = trimmed.slice('file://'.length);
        const hookContents = await readFile(filePath, 'utf8');
        return hookContents.toString();
    }
    return trimmed;
}
/** Pretty-prints a command result to stdout. */
export function renderCommandResult(result) {
    if (result.ok) {
        console.log('✅ Script executed successfully');
        if (sweetLinkDebug) {
            console.log('[sweetlink] command result payload', result);
        }
        if (hasCommandResultData(result)) {
            const formatted = formatResultData(result.data);
            if (formatted.includes('\n')) {
                console.log(`Result:\n${formatted}`);
            }
            else {
                console.log('Result:', formatted);
            }
        }
        if (result.console?.length) {
            console.log('\nConsole output:');
            for (const entry of result.console) {
                const timestamp = new Date(entry.timestamp).toLocaleTimeString();
                console.log(`[${timestamp}] ${entry.level}:`, ...entry.args);
            }
        }
        return;
    }
    console.error('❌ Script failed');
    console.error('Error:', result.error);
    if (typeof result.error === 'string' && result.error.includes('Session not found or offline')) {
        console.error('Hint: run `pnpm sweetlink sessions` to list active SweetLink sessions and grab a fresh id.');
    }
    if (result.stack) {
        console.error(result.stack);
    }
    if (result.console?.length) {
        console.error('\nConsole output before failure:');
        for (const entry of result.console) {
            const timestamp = new Date(entry.timestamp).toLocaleTimeString();
            console.error(`[${timestamp}] ${entry.level}:`, ...entry.args);
        }
    }
    process.exitCode = 1;
}
const hasCommandResultData = (value) => typeof value === 'object' && value !== null && 'data' in value;
/** Formats unknown result payloads safely for logging. */
export function formatResultData(value) {
    if (value === undefined) {
        return '(undefined)';
    }
    if (value === null) {
        return 'null';
    }
    if (typeof value === 'string') {
        return value;
    }
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        try {
            return inspect(value, { depth: 2, breakLength: 60 });
        }
        catch {
            return '[unserializable result]';
        }
    }
}
//# sourceMappingURL=scripts.js.map