import { analyzeConsoleWithCodex } from '../codex.js';
import { resolveConfig } from '../core/config.js';
import { readCommandOptions } from '../core/env.js';
import { sweetLinkDebug } from '../env.js';
import { renderCommandResult } from '../runtime/scripts.js';
import { buildClickScript, executeRunScriptCommand, fetchConsoleEvents, resolvePromptOption, resolveSessionIdFromHint, } from '../runtime/session.js';
import { extractEventMessage } from '../util/errors.js';
import { delay } from '../util/time.js';
const POST_CLICK_CONSOLE_LIMIT = 20;
export function registerClickCommand(program) {
    program
        .command('click <sessionId>')
        .description('Dispatch a click event on a selector inside a SweetLink session')
        .requiredOption('-s, --selector <selector>', 'CSS selector to click')
        .option('--no-scroll', 'Skip scrolling the element into view before clicking', false)
        .option('--no-bubbles', 'Dispatch the click event without bubbling', false)
        .option('-t, --timeout <ms>', 'Command timeout in milliseconds (default 15_000)', Number, 15_000)
        .option('--prompt <prompt>', 'Send console output after the click to Codex for analysis')
        .addOption(program.createOption('--question <prompt>').hideHelp())
        .action(async function (sessionId) {
        const options = readCommandOptions(this);
        const selector = options.selector?.trim();
        if (!selector) {
            throw new Error('A --selector value is required for sweetlink click');
        }
        const prompt = resolvePromptOption(options);
        const config = resolveConfig(this);
        const resolvedSessionId = await resolveSessionIdFromHint(sessionId, config);
        const baselineIds = await fetchBaselineConsoleIds(config, resolvedSessionId);
        const script = buildClickScript({
            selector,
            scrollIntoView: options.scroll !== false,
            bubbles: options.bubbles !== false,
        });
        const timeoutMs = typeof options.timeout === 'number' && Number.isFinite(options.timeout) ? options.timeout : 15_000;
        const result = await executeRunScriptCommand(config, {
            sessionId: resolvedSessionId,
            code: script,
            timeoutMs,
        });
        renderCommandResult(result);
        await delay(250);
        await reportConsoleAfterClick({ config, sessionId: resolvedSessionId, baselineIds, prompt, selector });
    });
}
async function fetchBaselineConsoleIds(config, sessionId) {
    try {
        const beforeEvents = await fetchConsoleEvents(config, sessionId);
        return new Set(beforeEvents.map((event) => event.id));
    }
    catch (error) {
        if (sweetLinkDebug) {
            console.warn('Failed to fetch baseline console events before click.', error);
        }
        return null;
    }
}
async function reportConsoleAfterClick(params) {
    try {
        const events = await fetchConsoleEvents(params.config, params.sessionId);
        const newEvents = params.baselineIds
            ? events.filter((event) => !params.baselineIds?.has(event.id))
            : events.slice(-POST_CLICK_CONSOLE_LIMIT);
        const recent = newEvents.slice(-POST_CLICK_CONSOLE_LIMIT);
        if (params.prompt) {
            const handled = await analyzeConsoleWithCodex(params.selector, params.prompt, recent, {
                silent: true,
                appLabel: params.config.appLabel,
            });
            if (handled) {
                return;
            }
        }
        if (recent.length > 0) {
            console.log(`Console after click (${recent.length} event${recent.length === 1 ? '' : 's'}):`);
            for (const event of recent) {
                const timestamp = new Date(event.timestamp ?? Date.now()).toLocaleTimeString();
                console.log(`  [${timestamp}] ${event.level}:`, ...event.args);
            }
            const dropped = newEvents.length - recent.length;
            if (dropped > 0) {
                console.log(`  … ${dropped} more event${dropped === 1 ? '' : 's'} omitted`);
            }
        }
        else if (params.prompt) {
            console.log('Console after click: no new events captured.');
        }
    }
    catch (error) {
        console.warn('Unable to fetch console events after click:', extractEventMessage(error));
    }
}
//# sourceMappingURL=click.js.map