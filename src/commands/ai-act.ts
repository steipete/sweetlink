import type { Command } from 'commander';
import type { Page } from 'playwright-core';
import { readCommandOptions } from '../core/env.js';
import { connectToDevTools, loadDevToolsConfig } from '../runtime/devtools.js';
import { fetchAccessibilityTree } from '../snapshot/accessibility.js';
import { assignRefs, resolveRefToSelector } from '../snapshot/refs.js';

type ActionKind = 'click' | 'type' | 'hover' | 'focus' | 'clear' | 'check' | 'uncheck';

interface AiActCommandOptions {
  kind: ActionKind;
  ref: string;
  text?: string;
  timeout?: number;
}

const VALID_ACTIONS: readonly ActionKind[] = [
  'click',
  'type',
  'hover',
  'focus',
  'clear',
  'check',
  'uncheck',
];

const REF_FORMAT_PATTERN = /^[a-z]\d+$/i;

/**
 * Registers the ai-act command for ref-based element interactions.
 *
 * Takes a ref ID from an ai-snapshot and performs the specified action
 * on that element.
 */
export function registerAiActCommand(program: Command): void {
  program
    .command('ai-act')
    .description('Perform an action on an element by ref ID from ai-snapshot')
    .requiredOption('-k, --kind <action>', `Action: ${VALID_ACTIONS.join(', ')}`)
    .requiredOption('-r, --ref <ref>', 'Element ref from ai-snapshot (e.g., e1, e42)')
    .option('-t, --text <text>', 'Text to type (required for type action)')
    .option('--timeout <ms>', 'Action timeout in milliseconds', Number, 30_000)
    .action(async function (this: Command) {
      const options = readCommandOptions<AiActCommandOptions>(this);

      // Validate action kind
      const kind = options.kind?.toLowerCase() as ActionKind;
      if (!VALID_ACTIONS.includes(kind)) {
        throw new Error(
          `Invalid action kind: ${options.kind}. Valid actions: ${VALID_ACTIONS.join(', ')}`
        );
      }

      // Validate ref format
      const ref = options.ref?.trim();
      if (!ref) {
        throw new Error('A --ref value is required');
      }
      if (!REF_FORMAT_PATTERN.test(ref)) {
        throw new Error(`Invalid ref format: ${ref}. Expected format like e1, e42`);
      }

      // Validate text for type action
      if (kind === 'type' && !options.text) {
        throw new Error('The --text option is required for the type action');
      }

      // Text length limit (1MB)
      const MAX_TEXT_LENGTH = 1024 * 1024;
      if (options.text && options.text.length > MAX_TEXT_LENGTH) {
        throw new Error(`Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters`);
      }

      // Load DevTools config
      const config = await loadDevToolsConfig();
      if (!config) {
        throw new Error(
          'No DevTools connection available. Run "sweetlink open --controlled" first.'
        );
      }

      // Connect to browser
      const { page } = await connectToDevTools(config);

      // Take a fresh snapshot to get current refs
      const tree = await fetchAccessibilityTree(page);
      const registry = assignRefs(tree);

      // Resolve ref to element
      const element = registry.refMap.get(ref);
      if (!element) {
        const availableRefs = Array.from(registry.refMap.keys()).slice(0, 10);
        throw new Error(
          `Ref "${ref}" not found. Available refs: ${availableRefs.join(', ')}${registry.refMap.size > 10 ? '...' : ''}`
        );
      }

      // Resolve to selector
      const selector = await resolveRefToSelector(page, registry, ref);
      if (!selector) {
        throw new Error(`Could not resolve ref "${ref}" to a selector`);
      }

      // Perform the action
      const timeout = options.timeout ?? 30_000;
      await performAction(page, selector, kind, options.text, timeout);

      console.log(
        `✓ ${kind} on ${element.role}${element.name ? ` "${element.name}"` : ''} [${ref}]`
      );
    });
}

/**
 * Performs the specified action on an element.
 */
async function performAction(
  page: Page,
  selector: string,
  kind: ActionKind,
  text: string | undefined,
  timeout: number
): Promise<void> {
  const locator = page.locator(selector).first();

  switch (kind) {
    case 'click':
      await locator.click({ timeout });
      break;

    case 'type':
      if (!text) throw new Error('Text is required for type action');
      await locator.fill(text, { timeout });
      break;

    case 'hover':
      await locator.hover({ timeout });
      break;

    case 'focus':
      await locator.focus({ timeout });
      break;

    case 'clear':
      await locator.clear({ timeout });
      break;

    case 'check':
      await locator.check({ timeout });
      break;

    case 'uncheck':
      await locator.uncheck({ timeout });
      break;

    default: {
      const exhaustiveCheck: never = kind;
      throw new Error(`Unknown action kind: ${exhaustiveCheck}`);
    }
  }
}
