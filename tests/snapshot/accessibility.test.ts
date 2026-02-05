import { describe, expect, it } from 'vitest';
import {
  type CDPAXNode,
  filterInteractiveNodes,
  isInteractiveRole,
  parseAccessibilityTree,
  shouldSkipRole,
} from '../../src/snapshot/accessibility.js';

describe('parseAccessibilityTree', () => {
  it('parses empty node list', () => {
    const tree = parseAccessibilityTree([]);

    expect(tree.nodes).toHaveLength(0);
    expect(tree.rootIds).toHaveLength(0);
    expect(tree.nodeMap.size).toBe(0);
  });

  it('parses a single node', () => {
    const nodes: CDPAXNode[] = [
      {
        nodeId: 'n1',
        ignored: false,
        role: { type: 'role', value: 'button' },
        name: { type: 'computedString', value: 'Submit' },
      },
    ];

    const tree = parseAccessibilityTree(nodes);

    expect(tree.nodes).toHaveLength(1);
    expect(tree.nodes[0]).toMatchObject({
      nodeId: 'n1',
      role: 'button',
      name: 'Submit',
    });
    expect(tree.rootIds).toEqual(['n1']);
  });

  it('skips ignored nodes', () => {
    const nodes: CDPAXNode[] = [
      { nodeId: 'n1', ignored: true, role: { type: 'role', value: 'generic' } },
      { nodeId: 'n2', ignored: false, role: { type: 'role', value: 'button' } },
    ];

    const tree = parseAccessibilityTree(nodes);

    expect(tree.nodes).toHaveLength(1);
    expect(tree.nodes[0]?.nodeId).toBe('n2');
  });

  it('parses node properties', () => {
    const nodes: CDPAXNode[] = [
      {
        nodeId: 'n1',
        ignored: false,
        role: { type: 'role', value: 'checkbox' },
        name: { type: 'computedString', value: 'Remember me' },
        properties: [
          { name: 'checked', value: { type: 'boolean', value: true } },
          { name: 'disabled', value: { type: 'boolean', value: false } },
        ],
        backendDOMNodeId: 42,
      },
    ];

    const tree = parseAccessibilityTree(nodes);

    expect(tree.nodes[0]).toMatchObject({
      role: 'checkbox',
      name: 'Remember me',
      checked: true,
      disabled: false,
      backendDOMNodeId: 42,
    });
  });

  it('builds parent-child relationships', () => {
    const nodes: CDPAXNode[] = [
      { nodeId: 'root', ignored: false, role: { type: 'role', value: 'main' }, childIds: ['child1', 'child2'] },
      { nodeId: 'child1', ignored: false, role: { type: 'role', value: 'button' } },
      { nodeId: 'child2', ignored: false, role: { type: 'role', value: 'link' } },
    ];

    const tree = parseAccessibilityTree(nodes);

    expect(tree.rootIds).toEqual(['root']);
    expect(tree.nodes).toHaveLength(3);
    expect(tree.nodeMap.get('root')?.childIds).toEqual(['child1', 'child2']);
  });

  it('handles missing optional fields', () => {
    const nodes: CDPAXNode[] = [{ nodeId: 'n1', ignored: false }];

    const tree = parseAccessibilityTree(nodes);

    expect(tree.nodes[0]).toMatchObject({
      nodeId: 'n1',
      role: 'unknown',
      name: '',
      childIds: [],
    });
  });

  it('extracts value from nodes', () => {
    const nodes: CDPAXNode[] = [
      {
        nodeId: 'n1',
        ignored: false,
        role: { type: 'role', value: 'textbox' },
        value: { type: 'string', value: 'user@example.com' },
      },
    ];

    const tree = parseAccessibilityTree(nodes);

    expect(tree.nodes[0]?.value).toBe('user@example.com');
  });

  it('converts numeric value to string', () => {
    const nodes: CDPAXNode[] = [
      {
        nodeId: 'n1',
        ignored: false,
        role: { type: 'role', value: 'spinbutton' },
        value: { type: 'number', value: 42 },
      },
    ];

    const tree = parseAccessibilityTree(nodes);

    expect(tree.nodes[0]?.value).toBe('42');
  });
});

describe('isInteractiveRole', () => {
  it('recognizes interactive roles', () => {
    expect(isInteractiveRole('button')).toBe(true);
    expect(isInteractiveRole('link')).toBe(true);
    expect(isInteractiveRole('textbox')).toBe(true);
    expect(isInteractiveRole('checkbox')).toBe(true);
    expect(isInteractiveRole('combobox')).toBe(true);
  });

  it('is case insensitive', () => {
    expect(isInteractiveRole('BUTTON')).toBe(true);
    expect(isInteractiveRole('Link')).toBe(true);
  });

  it('returns false for non-interactive roles', () => {
    expect(isInteractiveRole('heading')).toBe(false);
    expect(isInteractiveRole('paragraph')).toBe(false);
    expect(isInteractiveRole('generic')).toBe(false);
  });
});

describe('shouldSkipRole', () => {
  it('skips structural noise roles', () => {
    expect(shouldSkipRole('none')).toBe(true);
    expect(shouldSkipRole('presentation')).toBe(true);
    expect(shouldSkipRole('generic')).toBe(true);
    expect(shouldSkipRole('group')).toBe(true);
  });

  it('does not skip semantic roles', () => {
    expect(shouldSkipRole('button')).toBe(false);
    expect(shouldSkipRole('heading')).toBe(false);
    expect(shouldSkipRole('main')).toBe(false);
  });
});

describe('filterInteractiveNodes', () => {
  it('returns empty for tree with no interactive nodes', () => {
    const nodes: CDPAXNode[] = [
      { nodeId: 'n1', ignored: false, role: { type: 'role', value: 'heading' } },
    ];
    const tree = parseAccessibilityTree(nodes);

    const filtered = filterInteractiveNodes(tree);

    expect(filtered).toHaveLength(0);
  });

  it('includes interactive nodes', () => {
    const nodes: CDPAXNode[] = [
      { nodeId: 'n1', ignored: false, role: { type: 'role', value: 'button' } },
      { nodeId: 'n2', ignored: false, role: { type: 'role', value: 'heading' } },
      { nodeId: 'n3', ignored: false, role: { type: 'role', value: 'link' } },
    ];
    const tree = parseAccessibilityTree(nodes);

    const filtered = filterInteractiveNodes(tree);

    expect(filtered).toHaveLength(2);
    expect(filtered.map((n) => n.nodeId)).toContain('n1');
    expect(filtered.map((n) => n.nodeId)).toContain('n3');
  });

  it('includes ancestors of interactive nodes', () => {
    const nodes: CDPAXNode[] = [
      { nodeId: 'root', ignored: false, role: { type: 'role', value: 'main' }, childIds: ['nav'] },
      { nodeId: 'nav', ignored: false, role: { type: 'role', value: 'navigation' }, childIds: ['btn'] },
      { nodeId: 'btn', ignored: false, role: { type: 'role', value: 'button' } },
    ];
    const tree = parseAccessibilityTree(nodes);

    const filtered = filterInteractiveNodes(tree);

    expect(filtered).toHaveLength(3);
    expect(filtered.map((n) => n.nodeId)).toContain('root');
    expect(filtered.map((n) => n.nodeId)).toContain('nav');
    expect(filtered.map((n) => n.nodeId)).toContain('btn');
  });
});
