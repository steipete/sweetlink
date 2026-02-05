import type { Command } from 'commander';
import type { Page } from 'playwright-core';
import { readCommandOptions } from '../core/env.js';
import { connectToDevTools, loadDevToolsConfig } from '../runtime/devtools.js';
import { fetchAccessibilityTree } from '../snapshot/accessibility.js';
import { assignRefs, resolveRefToSelector, type RefRegistry } from '../snapshot/refs.js';

type ActionKind =
  | 'click'
  | 'type'
  | 'hover'
  | 'focus'
  | 'clear'
  | 'check'
  | 'uncheck'
  | 'press'
  | 'drag'
  | 'select';

interface AiActCommandOptions {
  kind: ActionKind;
  ref?: string;
  text?: string;
  key?: string;
  startRef?: string;
  endRef?: string;
  values?: string[];
  submit?: boolean;
  slowly?: boolean;
  doubleClick?: boolean;
  button?: string;
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
  'press',
  'drag',
  'select',
];

const VALID_BUTTONS = new Set(['left', 'right', 'middle']);
const REF_FORMAT_PATTERN = /^[a-z]\d+$/i;
const MAX_TEXT_LENGTH = 1_000_000; // 1MB
const MAX_KEY_LENGTH = 100;

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
    .option('-r, --ref <ref>', 'Element ref from ai-snapshot (e.g., e1, e42)')
    .option('-t, --text <text>', 'Text to type (for type action)')
    .option('--key <key>', 'Key to press (for press action, e.g., Enter, Escape, Tab)')
    .option('--start-ref <ref>', 'Drag start element ref (for drag action)')
    .option('--end-ref <ref>', 'Drag end element ref (for drag action)')
    .option('--values <values...>', 'Values to select (for select action)')
    .option('--submit', 'Press Enter after typing (for type action)', false)
    .option('--slowly', 'Type one character at a time (for type action)', false)
    .option('--double-click', 'Double-click (for click action)', false)
    .option('--button <button>', 'Mouse button: left, right, middle (for click action)')
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

      // Validate inputs based on action kind
      validateActionInputs(kind, options);

      // Load DevTools config
      const config = await loadDevToolsConfig();
      if (!config) {
        throw new Error(
          'No DevTools connection available. Run "sweetlink open --controlled" first.'
        );
      }

      // Connect to browser
      const { page } = await connectToDevTools(config);

      // For press action, no ref needed
      if (kind === 'press') {
        const key = options.key as string;
        await page.keyboard.press(key);
        console.log(`✓ press "${key}"`);
        return;
      }

      // Take a fresh snapshot to get current refs
      const tree = await fetchAccessibilityTree(page);
      const registry = assignRefs(tree);

      // Perform the action
      const timeout = options.timeout ?? 30_000;
      const result = await performAction(page, registry, kind, options, timeout);

      console.log(`✓ ${result}`);
    });
}

/**
 * Validates action inputs based on the action kind.
 */
function validateActionInputs(kind: ActionKind, options: AiActCommandOptions): void {
  switch (kind) {
    case 'press':
      if (!options.key) {
        throw new Error('The --key option is required for the press action');
      }
      if (options.key.length > MAX_KEY_LENGTH) {
        throw new Error(`Key name exceeds maximum length of ${MAX_KEY_LENGTH} characters`);
      }
      break;

    case 'drag':
      if (!(options.startRef && options.endRef)) {
        throw new Error('Both --start-ref and --end-ref are required for the drag action');
      }
      validateRef(options.startRef, 'start-ref');
      validateRef(options.endRef, 'end-ref');
      break;

    case 'select':
      if (!options.ref) {
        throw new Error('The --ref option is required for the select action');
      }
      validateRef(options.ref, 'ref');
      if (!options.values || options.values.length === 0) {
        throw new Error('The --values option is required for the select action');
      }
      break;

    case 'type':
      if (!options.ref) {
        throw new Error('The --ref option is required for the type action');
      }
      validateRef(options.ref, 'ref');
      if (!options.text) {
        throw new Error('The --text option is required for the type action');
      }
      if (options.text.length > MAX_TEXT_LENGTH) {
        throw new Error(`Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters`);
      }
      break;

    case 'click':
      if (!options.ref) {
        throw new Error('The --ref option is required for the click action');
      }
      validateRef(options.ref, 'ref');
      if (options.button && !VALID_BUTTONS.has(options.button)) {
        throw new Error(`Invalid button: ${options.button}. Valid: left, right, middle`);
      }
      break;

    default:
      if (!options.ref) {
        throw new Error(`The --ref option is required for the ${kind} action`);
      }
      validateRef(options.ref, 'ref');
  }
}

/**
 * Validates a ref format.
 */
function validateRef(ref: string, name: string): void {
  if (!REF_FORMAT_PATTERN.test(ref)) {
    throw new Error(`Invalid ${name} format: ${ref}. Expected format like e1, e42`);
  }
}

/**
 * Resolves a ref to a selector and validates it exists.
 */
async function resolveRef(
  page: Page,
  registry: RefRegistry,
  ref: string
): Promise<{ selector: string; element: { role: string; name: string } }> {
  const element = registry.refMap.get(ref);
  if (!element) {
    const availableRefs = Array.from(registry.refMap.keys()).slice(0, 10);
    throw new Error(
      `Ref "${ref}" not found. Available refs: ${availableRefs.join(', ')}${registry.refMap.size > 10 ? '...' : ''}`
    );
  }

  const selector = await resolveRefToSelector(page, registry, ref);
  if (!selector) {
    throw new Error(`Could not resolve ref "${ref}" to a selector`);
  }

  return { selector, element: { role: element.role, name: element.name } };
}

/**
 * Performs the specified action and returns a description.
 */
async function performAction(
  page: Page,
  registry: RefRegistry,
  kind: ActionKind,
  options: AiActCommandOptions,
  timeout: number
): Promise<string> {
  switch (kind) {
    case 'click': {
      const { selector, element } = await resolveRef(page, registry, options.ref as string);
      const locator = page.locator(selector).first();
      await locator.click({
        timeout,
        clickCount: options.doubleClick ? 2 : 1,
        button: (options.button as 'left' | 'right' | 'middle') ?? 'left',
      });
      const clickType = options.doubleClick ? 'double-click' : 'click';
      return `${clickType} on ${element.role}${element.name ? ` "${element.name}"` : ''} [${options.ref}]`;
    }

    case 'type': {
      const { selector, element } = await resolveRef(page, registry, options.ref as string);
      const locator = page.locator(selector).first();
      const text = options.text as string;

      if (options.slowly) {
        await locator.focus({ timeout });
        await page.keyboard.type(text, { delay: 50 });
      } else {
        await locator.fill(text, { timeout });
      }

      if (options.submit) {
        await page.keyboard.press('Enter');
      }

      return `type "${text.slice(0, 20)}${text.length > 20 ? '...' : ''}" into ${element.role} [${options.ref}]${options.submit ? ' (submitted)' : ''}`;
    }

    case 'hover': {
      const { selector, element } = await resolveRef(page, registry, options.ref as string);
      await page.locator(selector).first().hover({ timeout });
      return `hover on ${element.role}${element.name ? ` "${element.name}"` : ''} [${options.ref}]`;
    }

    case 'focus': {
      const { selector, element } = await resolveRef(page, registry, options.ref as string);
      await page.locator(selector).first().focus({ timeout });
      return `focus on ${element.role}${element.name ? ` "${element.name}"` : ''} [${options.ref}]`;
    }

    case 'clear': {
      const { selector, element } = await resolveRef(page, registry, options.ref as string);
      await page.locator(selector).first().clear({ timeout });
      return `clear ${element.role} [${options.ref}]`;
    }

    case 'check': {
      const { selector, element } = await resolveRef(page, registry, options.ref as string);
      await page.locator(selector).first().check({ timeout });
      return `check ${element.role}${element.name ? ` "${element.name}"` : ''} [${options.ref}]`;
    }

    case 'uncheck': {
      const { selector, element } = await resolveRef(page, registry, options.ref as string);
      await page.locator(selector).first().uncheck({ timeout });
      return `uncheck ${element.role}${element.name ? ` "${element.name}"` : ''} [${options.ref}]`;
    }

    case 'drag': {
      const start = await resolveRef(page, registry, options.startRef as string);
      const end = await resolveRef(page, registry, options.endRef as string);
      await page.locator(start.selector).first().dragTo(page.locator(end.selector).first(), { timeout });
      return `drag from ${start.element.role} [${options.startRef}] to ${end.element.role} [${options.endRef}]`;
    }

    case 'select': {
      const { selector, element } = await resolveRef(page, registry, options.ref as string);
      const values = options.values as string[];
      await page.locator(selector).first().selectOption(values, { timeout });
      return `select "${values.join(', ')}" in ${element.role} [${options.ref}]`;
    }

    case 'press':
      // Handled before this function
      throw new Error('press action should be handled before performAction');

    default: {
      const exhaustiveCheck: never = kind;
      throw new Error(`Unknown action kind: ${exhaustiveCheck}`);
    }
  }
}
