// ---------------------------------------------------------------------------
// AI Snapshot Formatter
// Converts accessibility tree + refs into concise text output for AI agents
// ---------------------------------------------------------------------------

import type { RefElement, RefRegistry } from './refs.js';

/** Options for snapshot formatting */
export interface FormatOptions {
  /** Include element refs in output */
  readonly includeRefs?: boolean;
  /** Maximum depth to render */
  readonly maxDepth?: number;
  /** Compact mode: skip empty names, reduce whitespace */
  readonly compact?: boolean;
  /** Maximum output length in characters */
  readonly maxChars?: number;
}

/** Formatted snapshot result */
export interface FormattedSnapshot {
  readonly output: string;
  readonly truncated: boolean;
  readonly stats: {
    readonly lines: number;
    readonly chars: number;
    readonly elements: number;
    readonly interactive: number;
  };
}

/** Roles that should be treated as interactive for stats */
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'option',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'switch',
  'slider',
  'spinbutton',
  'searchbox',
  'treeitem',
]);

/**
 * Formats a ref registry into a concise text snapshot.
 *
 * Output format:
 *   role "name" [ref:id] key=value
 *
 * Examples:
 *   heading "Welcome"
 *   button "Sign In" [ref:e1]
 *   textbox "Email" [ref:e2] required
 *   checkbox "Remember me" [ref:e3] checked
 */
export function formatSnapshot(
  registry: RefRegistry,
  options: FormatOptions = {}
): FormattedSnapshot {
  const {
    includeRefs = true,
    maxDepth = 50,
    compact = false,
    maxChars = 1_000_000,
  } = options;

  const lines: string[] = [];
  let interactiveCount = 0;
  let truncated = false;
  let totalChars = 0;

  for (const element of registry.elements) {
    if (element.depth > maxDepth) continue;

    // Skip empty names in compact mode
    if (compact && !element.name && !isInteractiveRole(element.role)) {
      continue;
    }

    const line = formatElement(element, { includeRefs, compact });

    // Check character limit
    if (totalChars + line.length + 1 > maxChars) {
      truncated = true;
      break;
    }

    lines.push(line);
    totalChars += line.length + 1; // +1 for newline

    if (isInteractiveRole(element.role)) {
      interactiveCount += 1;
    }
  }

  const output = lines.join('\n');

  return {
    output,
    truncated,
    stats: {
      lines: lines.length,
      chars: output.length,
      elements: registry.elements.length,
      interactive: interactiveCount,
    },
  };
}

/**
 * Formats a single element into a text line.
 */
function formatElement(
  element: RefElement,
  options: { includeRefs: boolean; compact: boolean }
): string {
  const parts: string[] = [];

  // Indentation based on depth
  const indent = '  '.repeat(element.depth);

  // Role
  parts.push(indent + element.role);

  // Name (quoted if present)
  if (element.name) {
    const escapedName = element.name.replace(/"/g, '\\"');
    const truncatedName = escapedName.length > 100
      ? `${escapedName.slice(0, 100)}...`
      : escapedName;
    parts.push(`"${truncatedName}"`);
  }

  // Ref
  if (options.includeRefs) {
    parts.push(`[ref:${element.ref}]`);
  }

  // State attributes (only in non-compact mode or if significant)
  const attrs: string[] = [];

  if (element.value && element.value !== element.name) {
    attrs.push(`value="${element.value.slice(0, 50)}"`);
  }
  if (element.checked) attrs.push('checked');
  if (element.selected) attrs.push('selected');
  if (element.expanded) attrs.push('expanded');
  if (element.disabled) attrs.push('disabled');
  if (element.focused) attrs.push('focused');

  // Only include attrs in non-compact mode, or always include checked/disabled
  if (!options.compact || element.checked || element.disabled) {
    for (const attr of attrs) {
      parts.push(attr);
    }
  }

  return parts.join(' ');
}

/**
 * Checks if a role is interactive.
 */
function isInteractiveRole(role: string): boolean {
  return INTERACTIVE_ROLES.has(role.toLowerCase());
}

/**
 * Formats a snapshot as a hierarchical tree structure.
 * Alternative format that preserves parent-child relationships.
 */
export function formatSnapshotTree(
  registry: RefRegistry,
  options: FormatOptions = {}
): FormattedSnapshot {
  // For tree format, we need to rebuild hierarchy from depths
  // This is a simplified version that just uses indentation

  return formatSnapshot(registry, options);
}

/**
 * Formats a snapshot in ARIA-style format.
 * More verbose, includes all accessibility properties.
 */
export function formatSnapshotAria(
  registry: RefRegistry,
  options: FormatOptions = {}
): FormattedSnapshot {
  const {
    maxDepth = 50,
    maxChars = 1_000_000,
  } = options;

  const lines: string[] = [];
  let interactiveCount = 0;
  let truncated = false;
  let totalChars = 0;

  for (const element of registry.elements) {
    if (element.depth > maxDepth) continue;

    const indent = '  '.repeat(element.depth);
    const parts = [`${indent}[${element.role}]`];

    if (element.name) {
      parts.push(`name="${element.name.slice(0, 100)}"`);
    }
    if (element.description) {
      parts.push(`desc="${element.description.slice(0, 100)}"`);
    }
    if (element.value) {
      parts.push(`value="${element.value.slice(0, 50)}"`);
    }

    parts.push(`ref=${element.ref}`);

    const states: string[] = [];
    if (element.checked) states.push('checked');
    if (element.selected) states.push('selected');
    if (element.expanded) states.push('expanded');
    if (element.disabled) states.push('disabled');
    if (element.focused) states.push('focused');

    if (states.length > 0) {
      parts.push(`state={${states.join(',')}}`);
    }

    const line = parts.join(' ');

    if (totalChars + line.length + 1 > maxChars) {
      truncated = true;
      break;
    }

    lines.push(line);
    totalChars += line.length + 1;

    if (isInteractiveRole(element.role)) {
      interactiveCount += 1;
    }
  }

  const output = lines.join('\n');

  return {
    output,
    truncated,
    stats: {
      lines: lines.length,
      chars: output.length,
      elements: registry.elements.length,
      interactive: interactiveCount,
    },
  };
}
