// ---------------------------------------------------------------------------
// Ref Assignment and Element Registry
// Assigns stable ref IDs to interactive elements for AI agent interactions
// ---------------------------------------------------------------------------

import type { Page } from 'playwright-core';
import {
  type AccessibilityTree,
  filterInteractiveNodes,
  isInteractiveRole,
  shouldSkipRole,
} from './accessibility.js';

/** Element with assigned ref ID */
export interface RefElement {
  readonly ref: string;
  readonly role: string;
  readonly name: string;
  readonly description?: string;
  readonly value?: string;
  readonly checked?: boolean;
  readonly selected?: boolean;
  readonly expanded?: boolean;
  readonly disabled?: boolean;
  readonly focused?: boolean;
  readonly nodeId: string;
  readonly backendDOMNodeId?: number;
  readonly depth: number;
}

/** Registry mapping refs to elements */
export interface RefRegistry {
  readonly elements: readonly RefElement[];
  readonly refMap: ReadonlyMap<string, RefElement>;
  readonly nodeIdMap: ReadonlyMap<string, RefElement>;
}

/** Options for ref assignment */
export interface RefAssignmentOptions {
  /** Only assign refs to interactive elements */
  readonly interactiveOnly?: boolean;
  /** Maximum tree depth to traverse */
  readonly maxDepth?: number;
  /** Ref prefix (default: 'e') */
  readonly prefix?: string;
}

const DEFAULT_PREFIX = 'e';
const DEFAULT_MAX_DEPTH = 50;

/**
 * Assigns ref IDs to elements in the accessibility tree.
 */
export function assignRefs(
  tree: AccessibilityTree,
  options: RefAssignmentOptions = {}
): RefRegistry {
  const {
    interactiveOnly = false,
    maxDepth = DEFAULT_MAX_DEPTH,
    prefix = DEFAULT_PREFIX,
  } = options;

  const elements: RefElement[] = [];
  const refMap = new Map<string, RefElement>();
  const nodeIdMap = new Map<string, RefElement>();
  let refCounter = 0;

  // Get nodes to process
  const nodesToProcess = interactiveOnly
    ? filterInteractiveNodes(tree)
    : tree.nodes.filter((n) => !shouldSkipRole(n.role));

  // Build parent-child relationships for depth calculation
  const depthMap = calculateDepths(tree);

  for (const node of nodesToProcess) {
    const depth = depthMap.get(node.nodeId) ?? 0;
    if (depth > maxDepth) continue;

    // Only assign refs to interactive elements or elements with names
    const shouldAssignRef = isInteractiveRole(node.role) || node.name.length > 0;
    if (!shouldAssignRef && interactiveOnly) continue;

    refCounter += 1;
    const ref = `${prefix}${refCounter}`;

    const element: RefElement = {
      ref,
      role: node.role,
      name: node.name,
      description: node.description,
      value: node.value,
      checked: node.checked,
      selected: node.selected,
      expanded: node.expanded,
      disabled: node.disabled,
      focused: node.focused,
      nodeId: node.nodeId,
      backendDOMNodeId: node.backendDOMNodeId,
      depth,
    };

    elements.push(element);
    refMap.set(ref, element);
    nodeIdMap.set(node.nodeId, element);
  }

  return { elements, refMap, nodeIdMap };
}

/**
 * Calculates depth of each node in the tree.
 */
function calculateDepths(tree: AccessibilityTree): Map<string, number> {
  const depthMap = new Map<string, number>();

  function setDepth(nodeId: string, depth: number): void {
    if (depthMap.has(nodeId)) return;
    depthMap.set(nodeId, depth);

    const node = tree.nodeMap.get(nodeId);
    if (node) {
      for (const childId of node.childIds) {
        setDepth(childId, depth + 1);
      }
    }
  }

  for (const rootId of tree.rootIds) {
    setDepth(rootId, 0);
  }

  return depthMap;
}

/**
 * Resolves a ref ID to a CSS selector for element interaction.
 * Uses the backend DOM node ID to query the element.
 */
export async function resolveRefToSelector(
  page: Page,
  registry: RefRegistry,
  ref: string
): Promise<string | null> {
  const element = registry.refMap.get(ref);
  if (!element) return null;

  if (!element.backendDOMNodeId) {
    // Fallback: try to find by role and name
    return buildFallbackSelector(element);
  }

  // Use CDP to resolve the node to a selector
  const client = await page.context().newCDPSession(page);
  try {
    const result = await client.send('DOM.describeNode', {
      backendNodeId: element.backendDOMNodeId,
    }) as { node?: { localName?: string; attributes?: string[] } };

    if (result.node) {
      const { localName, attributes } = result.node;
      const attrMap = parseAttributes(attributes ?? []);

      // Build selector from attributes
      if (attrMap.id) {
        return `#${CSS.escape(attrMap.id)}`;
      }
      if (attrMap['data-testid']) {
        return `[data-testid="${CSS.escape(attrMap['data-testid'])}"]`;
      }
      if (attrMap.name && localName) {
        return `${localName}[name="${CSS.escape(attrMap.name)}"]`;
      }
      if (localName) {
        // Use aria-label or text content matching
        if (element.name) {
          return `${localName}:has-text("${element.name.slice(0, 50)}")`;
        }
        return localName;
      }
    }

    return buildFallbackSelector(element);
  } finally {
    await client.detach();
  }
}

/**
 * Parses CDP attribute array into a map.
 */
function parseAttributes(attrs: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < attrs.length; i += 2) {
    const key = attrs[i];
    const value = attrs[i + 1];
    if (key !== undefined && value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Builds a fallback selector from element properties.
 */
function buildFallbackSelector(element: RefElement): string {
  const { role, name } = element;

  // Map common accessibility roles to HTML elements/selectors
  const roleSelectors: Record<string, string> = {
    button: 'button',
    link: 'a',
    textbox: 'input[type="text"], input:not([type]), textarea',
    checkbox: 'input[type="checkbox"]',
    radio: 'input[type="radio"]',
    combobox: 'select, [role="combobox"]',
    listbox: '[role="listbox"], select',
    option: 'option, [role="option"]',
    menuitem: '[role="menuitem"]',
    tab: '[role="tab"]',
    switch: '[role="switch"]',
    slider: 'input[type="range"], [role="slider"]',
    spinbutton: 'input[type="number"]',
    searchbox: 'input[type="search"]',
    heading: 'h1, h2, h3, h4, h5, h6',
  };

  const baseSelector = roleSelectors[role.toLowerCase()] ?? `[role="${role}"]`;

  if (name) {
    // Try to match by accessible name
    const escapedName = name.replace(/"/g, '\\"').slice(0, 50);
    return `${baseSelector}:has-text("${escapedName}")`;
  }

  return baseSelector;
}

/**
 * CSS.escape polyfill for Node.js environment.
 */
const CSS = {
  escape(value: string): string {
    return value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  },
};
