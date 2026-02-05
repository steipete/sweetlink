// ---------------------------------------------------------------------------
// CDP Accessibility Tree Module
// Fetches the browser's accessibility tree for AI-optimized page snapshots
// ---------------------------------------------------------------------------

import type { Page } from 'playwright-core';

/** Raw CDP accessibility node from Accessibility.getFullAXTree */
export interface CDPAXNode {
  readonly nodeId: string;
  readonly ignored: boolean;
  readonly role?: { type: string; value: string };
  readonly name?: { type: string; value: string };
  readonly description?: { type: string; value: string };
  readonly value?: { type: string; value: string | number | boolean };
  readonly properties?: ReadonlyArray<{
    name: string;
    value: { type: string; value: unknown };
  }>;
  readonly childIds?: readonly string[];
  readonly backendDOMNodeId?: number;
}

/** Parsed accessibility node with extracted values */
export interface AXNode {
  readonly nodeId: string;
  readonly role: string;
  readonly name: string;
  readonly description?: string;
  readonly value?: string;
  readonly checked?: boolean;
  readonly selected?: boolean;
  readonly expanded?: boolean;
  readonly disabled?: boolean;
  readonly focused?: boolean;
  readonly required?: boolean;
  readonly childIds: readonly string[];
  readonly backendDOMNodeId?: number;
}

/** Accessibility tree with lookup by node ID */
export interface AccessibilityTree {
  readonly nodes: readonly AXNode[];
  readonly nodeMap: ReadonlyMap<string, AXNode>;
  readonly rootIds: readonly string[];
}

/** Roles considered interactive for filtering */
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

/** Roles to skip in output (structural noise) */
const SKIP_ROLES = new Set([
  'none',
  'presentation',
  'generic',
  'group', // often just containers
]);

/**
 * Fetches the full accessibility tree from the browser via CDP.
 */
export async function fetchAccessibilityTree(page: Page): Promise<AccessibilityTree> {
  const client = await page.context().newCDPSession(page);

  try {
    // Enable accessibility domain
    await client.send('Accessibility.enable');

    // Get the full tree
    const result = await client.send('Accessibility.getFullAXTree') as { nodes: CDPAXNode[] };

    return parseAccessibilityTree(result.nodes);
  } finally {
    await client.detach();
  }
}

/**
 * Parses raw CDP nodes into a structured accessibility tree.
 */
export function parseAccessibilityTree(rawNodes: readonly CDPAXNode[]): AccessibilityTree {
  const nodes: AXNode[] = [];
  const nodeMap = new Map<string, AXNode>();
  const childNodeIds = new Set<string>();

  for (const raw of rawNodes) {
    if (raw.ignored) continue;

    const role = raw.role?.value ?? 'unknown';
    const name = raw.name?.value ?? '';

    // Extract properties
    const props = new Map<string, unknown>();
    if (raw.properties) {
      for (const prop of raw.properties) {
        props.set(prop.name, prop.value?.value);
      }
    }

    const node: AXNode = {
      nodeId: raw.nodeId,
      role,
      name,
      description: raw.description?.value,
      value: raw.value?.value != null ? String(raw.value.value) : undefined,
      checked: props.get('checked') === true || props.get('checked') === 'true',
      selected: props.get('selected') === true,
      expanded: props.get('expanded') === true,
      disabled: props.get('disabled') === true,
      focused: props.get('focused') === true,
      required: props.get('required') === true,
      childIds: raw.childIds ?? [],
      backendDOMNodeId: raw.backendDOMNodeId,
    };

    nodes.push(node);
    nodeMap.set(node.nodeId, node);

    // Track which nodes are children
    for (const childId of node.childIds) {
      childNodeIds.add(childId);
    }
  }

  // Root nodes are those not referenced as children
  const rootIds = nodes
    .filter((n) => !childNodeIds.has(n.nodeId))
    .map((n) => n.nodeId);

  return { nodes, nodeMap, rootIds };
}

/**
 * Checks if a node has an interactive role.
 */
export function isInteractiveRole(role: string): boolean {
  return INTERACTIVE_ROLES.has(role.toLowerCase());
}

/**
 * Checks if a node should be skipped in output.
 */
export function shouldSkipRole(role: string): boolean {
  return SKIP_ROLES.has(role.toLowerCase());
}

/**
 * Filters the tree to only include interactive elements and their ancestors.
 */
export function filterInteractiveNodes(tree: AccessibilityTree): AXNode[] {
  const interactiveIds = new Set<string>();

  // Find all interactive nodes
  for (const node of tree.nodes) {
    if (isInteractiveRole(node.role)) {
      interactiveIds.add(node.nodeId);
    }
  }

  // Include ancestors of interactive nodes
  const includedIds = new Set<string>(interactiveIds);

  function addAncestors(nodeId: string): void {
    for (const node of tree.nodes) {
      if (node.childIds.includes(nodeId) && !includedIds.has(node.nodeId)) {
        includedIds.add(node.nodeId);
        addAncestors(node.nodeId);
      }
    }
  }

  for (const id of interactiveIds) {
    addAncestors(id);
  }

  return tree.nodes.filter((n) => includedIds.has(n.nodeId));
}
