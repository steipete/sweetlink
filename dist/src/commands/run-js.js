import { resolveConfig } from '../core/config.js';
import { readCommandOptions } from '../core/env.js';
import { renderCommandResult, resolveScript } from '../runtime/scripts.js';
import { executeRunScriptCommand, resolveSessionIdFromHint } from '../runtime/session.js';
/** Registers the `sweetlink run-js` command. */
export function registerRunJsCommand(program) {
    program
        .command('run-js <sessionId> [inline...]')
        .description('Execute JavaScript inside a SweetLink session')
        .option('-c, --code <code...>', 'Inline JavaScript to execute')
        .option('-f, --file <path>', 'Path to a file containing JavaScript')
        .option('--capture-console', 'Return console output from the page context', false)
        .option('-t, --timeout <ms>', 'Command timeout in milliseconds (default 15_000)', Number, 15_000)
        .action(async function (sessionId, inline) {
        const options = readCommandOptions(this);
        const code = await resolveScript(options, inline);
        const config = resolveConfig(this);
        const resolvedSessionId = await resolveSessionIdFromHint(sessionId, config);
        const result = await executeRunScriptCommand(config, {
            sessionId: resolvedSessionId,
            code,
            timeoutMs: options.timeout,
            captureConsole: options.captureConsole,
        });
        renderCommandResult(result);
    });
}
//# sourceMappingURL=run-js.js.map