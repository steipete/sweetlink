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
  | 'select'
  | 'fill'
  | 'resize'
  | 'wait'
  | 'evaluate'
  | 'close';

interface FillField {
  ref: string;
  value: string;
}

interface AiActCommandOptions {
  kind: ActionKind;
  ref?: string;
  text?: string;
  key?: string;
  startRef?: string;
  endRef?: string;
  values?: string[];
  fields?: string[];
  width?: number;
  height?: number;
  time?: number;
  fn?: string;
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
  'fill',
  'resize',
  'wait',
  'evaluate',
  'close',
];

const VALID_BUTTONS = new Set(['left', 'right', 'middle']);
const REF_FORMAT_PATTERN = /^[a-z]\d+$/i;
const MAX_TEXT_LENGTH = 1_000_000; // 1MB
const MAX_KEY_LENGTH = 100;
const MAX_FN_LENGTH = 100_000; // 100KB
const MAX_DIMENSION = 32_767;

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
    .option('--fields <fields...>', 'Fields to fill as ref:value pairs (for fill action)')
    .option('--width <n>', 'Viewport width (for resize action)', Number)
    .option('--height <n>', 'Viewport height (for resize action)', Number)
    .option('--time <ms>', 'Time to wait in ms (for wait action)', Number)
    .option('--fn <code>', 'JavaScript function to evaluate (for evaluate action)')
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

      // Handle actions that don't need refs
      if (kind === 'press') {
        const key = options.key as string;
        await page.keyboard.press(key);
        console.log(`✓ press "${key}"`);
        return;
      }

      if (kind === 'resize') {
        const width = options.width as number;
        const height = options.height as number;
        await page.setViewportSize({ width, height });
        console.log(`✓ resize viewport to ${width}x${height}`);
        return;
      }

      if (kind === 'wait') {
        const time = options.time as number;
        await page.waitForTimeout(time);
        console.log(`✓ waited ${time}ms`);
        return;
      }

      if (kind === 'evaluate') {
        const fn = options.fn as string;
        const ref = options.ref;
        let result: unknown;

        if (ref) {
          // Evaluate with element context
          const tree = await fetchAccessibilityTree(page);
          const registry = assignRefs(tree);
          const { selector } = await resolveRef(page, registry, ref);
          const locator = page.locator(selector).first();
          result = await locator.evaluate(new Function('element', fn) as (el: Element) => unknown);
        } else {
          // Evaluate in page context
          result = await page.evaluate(new Function(fn) as () => unknown);
        }

        if (result !== undefined) {
          console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
        } else {
          console.log('✓ evaluate completed');
        }
        return;
      }

      if (kind === 'close') {
        await page.close();
        console.log('✓ page closed');
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
  const validators: Record<ActionKind, () => void> = {
    press: () => validatePressInputs(options),
    drag: () => validateDragInputs(options),
    select: () => validateSelectInputs(options),
    fill: () => validateFillInputs(options),
    resize: () => validateResizeInputs(options),
    wait: () => validateWaitInputs(options),
    evaluate: () => validateEvaluateInputs(options),
    close: () => { /* No validation needed */ },
    type: () => validateTypeInputs(options),
    click: () => validateClickInputs(options),
    hover: () => validateRefRequired(options, 'hover'),
    focus: () => validateRefRequired(options, 'focus'),
    clear: () => validateRefRequired(options, 'clear'),
    check: () => validateRefRequired(options, 'check'),
    uncheck: () => validateRefRequired(options, 'uncheck'),
  };

  validators[kind]();
}

function validatePressInputs(options: AiActCommandOptions): void {
  if (!options.key) {
    throw new Error('The --key option is required for the press action');
  }
  if (options.key.length > MAX_KEY_LENGTH) {
    throw new Error(`Key name exceeds maximum length of ${MAX_KEY_LENGTH} characters`);
  }
}

function validateDragInputs(options: AiActCommandOptions): void {
  if (!(options.startRef && options.endRef)) {
    throw new Error('Both --start-ref and --end-ref are required for the drag action');
  }
  validateRef(options.startRef, 'start-ref');
  validateRef(options.endRef, 'end-ref');
}

function validateSelectInputs(options: AiActCommandOptions): void {
  if (!options.ref) {
    throw new Error('The --ref option is required for the select action');
  }
  validateRef(options.ref, 'ref');
  if (!options.values || options.values.length === 0) {
    throw new Error('The --values option is required for the select action');
  }
}

function validateFillInputs(options: AiActCommandOptions): void {
  if (!options.fields || options.fields.length === 0) {
    throw new Error('The --fields option is required for the fill action (format: ref:value)');
  }
  for (const field of options.fields) {
    const colonIndex = field.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(`Invalid field format: ${field}. Expected ref:value`);
    }
    const ref = field.slice(0, colonIndex);
    validateRef(ref, 'field ref');
  }
}

function validateResizeInputs(options: AiActCommandOptions): void {
  if (options.width === undefined || options.height === undefined) {
    throw new Error('Both --width and --height are required for the resize action');
  }
  if (options.width <= 0 || options.width > MAX_DIMENSION) {
    throw new Error(`Width must be between 1 and ${MAX_DIMENSION}`);
  }
  if (options.height <= 0 || options.height > MAX_DIMENSION) {
    throw new Error(`Height must be between 1 and ${MAX_DIMENSION}`);
  }
}

function validateWaitInputs(options: AiActCommandOptions): void {
  if (options.time === undefined) {
    throw new Error('The --time option is required for the wait action');
  }
  if (options.time <= 0 || options.time > 300_000) {
    throw new Error('Wait time must be between 1 and 300000 ms');
  }
}

function validateEvaluateInputs(options: AiActCommandOptions): void {
  if (!options.fn) {
    throw new Error('The --fn option is required for the evaluate action');
  }
  if (options.fn.length > MAX_FN_LENGTH) {
    throw new Error(`Function code exceeds maximum length of ${MAX_FN_LENGTH} characters`);
  }
}

function validateTypeInputs(options: AiActCommandOptions): void {
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
}

function validateClickInputs(options: AiActCommandOptions): void {
  if (!options.ref) {
    throw new Error('The --ref option is required for the click action');
  }
  validateRef(options.ref, 'ref');
  if (options.button && !VALID_BUTTONS.has(options.button)) {
    throw new Error(`Invalid button: ${options.button}. Valid: left, right, middle`);
  }
}

function validateRefRequired(options: AiActCommandOptions, action: string): void {
  if (!options.ref) {
    throw new Error(`The --ref option is required for the ${action} action`);
  }
  validateRef(options.ref, 'ref');
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
 * Parses field strings into FillField objects.
 */
function parseFields(fields: string[]): FillField[] {
  return fields.map((field) => {
    const colonIndex = field.indexOf(':');
    return {
      ref: field.slice(0, colonIndex),
      value: field.slice(colonIndex + 1),
    };
  });
}

/**
 * Fills multiple form fields sequentially.
 */
async function fillFields(
  page: Page,
  registry: RefRegistry,
  fields: FillField[],
  timeout: number
): Promise<string[]> {
  const results: string[] = [];

  for (const field of fields) {
    // biome-ignore lint/performance/noAwaitInLoops: fields must be filled sequentially
    const { selector, element } = await resolveRef(page, registry, field.ref);
    // biome-ignore lint/performance/noAwaitInLoops: fields must be filled sequentially
    await page.locator(selector).first().fill(field.value, { timeout });
    results.push(`${element.role} [${field.ref}]`);
  }

  return results;
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

    case 'fill': {
      const fields = parseFields(options.fields as string[]);
      const filled = await fillFields(page, registry, fields, timeout);
      return `fill ${filled.length} field${filled.length === 1 ? '' : 's'}: ${filled.join(', ')}`;
    }

    // These are handled before performAction is called
    case 'press':
    case 'resize':
    case 'wait':
    case 'evaluate':
    case 'close':
      throw new Error(`${kind} action should be handled before performAction`);

    default: {
      const exhaustiveCheck: never = kind;
      throw new Error(`Unknown action kind: ${exhaustiveCheck}`);
    }
  }
}
