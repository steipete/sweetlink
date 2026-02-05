import { describe, expect, it } from 'vitest';
import { parseAccessibilityTree, type CDPAXNode } from '../../src/snapshot/accessibility.js';
import { assignRefs } from '../../src/snapshot/refs.js';

describe('assignRefs', () => {
  it('assigns refs to all non-skipped nodes', () => {
    const nodes: CDPAXNode[] = [
      { nodeId: 'n1', ignored: false, role: { type: 'role', value: 'button' }, name: { type: 'string', value: 'OK' } },
      { nodeId: 'n2', ignored: false, role: { type: 'role', value: 'link' }, name: { type: 'string', value: 'Home' } },
    ];
    const tree = parseAccessibilityTree(nodes);

    const registry = assignRefs(tree);

    expect(registry.elements).toHaveLength(2);
    expect(registry.elements[0]?.ref).toBe('e1');
    expect(registry.elements[1]?.ref).toBe('e2');
  });

  it('uses custom prefix', () => {
    const nodes: CDPAXNode[] = [
      { nodeId: 'n1', ignored: false, role: { type: 'role', value: 'button' } },
    ];
    const tree = parseAccessibilityTree(nodes);

    const registry = assignRefs(tree, { prefix: 'r' });

    expect(registry.elements[0]?.ref).toBe('r1');
  });

  it('filters to interactive-only when requested', () => {
    const nodes: CDPAXNode[] = [
      { nodeId: 'n1', ignored: false, role: { type: 'role', value: 'heading' }, name: { type: 'string', value: 'Title' } },
      { nodeId: 'n2', ignored: false, role: { type: 'role', value: 'button' }, name: { type: 'string', value: 'Click' } },
      { nodeId: 'n3', ignored: false, role: { type: 'role', value: 'paragraph' } },
    ];
    const tree = parseAccessibilityTree(nodes);

    const registry = assignRefs(tree, { interactiveOnly: true });

    // Only button is interactive
    expect(registry.elements).toHaveLength(1);
    expect(registry.elements[0]?.role).toBe('button');
  });

  it('respects maxDepth option', () => {
    const nodes: CDPAXNode[] = [
      { nodeId: 'root', ignored: false, role: { type: 'role', value: 'main' }, childIds: ['child'] },
      { nodeId: 'child', ignored: false, role: { type: 'role', value: 'button' } },
    ];
    const tree = parseAccessibilityTree(nodes);

    const registry = assignRefs(tree, { maxDepth: 0 });

    // Only root (depth 0) should be included
    expect(registry.elements).toHaveLength(1);
    expect(registry.elements[0]?.nodeId).toBe('root');
  });

  it('builds refMap for lookups', () => {
    const nodes: CDPAXNode[] = [
      { nodeId: 'n1', ignored: false, role: { type: 'role', value: 'button' }, name: { type: 'string', value: 'Submit' } },
    ];
    const tree = parseAccessibilityTree(nodes);

    const registry = assignRefs(tree);

    expect(registry.refMap.get('e1')).toMatchObject({
      ref: 'e1',
      role: 'button',
      name: 'Submit',
    });
  });

  it('builds nodeIdMap for lookups', () => {
    const nodes: CDPAXNode[] = [
      { nodeId: 'node-123', ignored: false, role: { type: 'role', value: 'link' } },
    ];
    const tree = parseAccessibilityTree(nodes);

    const registry = assignRefs(tree);

    expect(registry.nodeIdMap.get('node-123')?.ref).toBe('e1');
  });

  it('preserves backendDOMNodeId', () => {
    const nodes: CDPAXNode[] = [
      {
        nodeId: 'n1',
        ignored: false,
        role: { type: 'role', value: 'button' },
        backendDOMNodeId: 999,
      },
    ];
    const tree = parseAccessibilityTree(nodes);

    const registry = assignRefs(tree);

    expect(registry.elements[0]?.backendDOMNodeId).toBe(999);
  });

  it('calculates correct depth for nested elements', () => {
    const nodes: CDPAXNode[] = [
      { nodeId: 'root', ignored: false, role: { type: 'role', value: 'main' }, childIds: ['level1'] },
      { nodeId: 'level1', ignored: false, role: { type: 'role', value: 'navigation' }, childIds: ['level2'] },
      { nodeId: 'level2', ignored: false, role: { type: 'role', value: 'button' } },
    ];
    const tree = parseAccessibilityTree(nodes);

    const registry = assignRefs(tree);

    const depths = registry.elements.map((e) => ({ nodeId: e.nodeId, depth: e.depth }));
    expect(depths).toContainEqual({ nodeId: 'root', depth: 0 });
    expect(depths).toContainEqual({ nodeId: 'level1', depth: 1 });
    expect(depths).toContainEqual({ nodeId: 'level2', depth: 2 });
  });

  it('preserves element state properties', () => {
    const nodes: CDPAXNode[] = [
      {
        nodeId: 'n1',
        ignored: false,
        role: { type: 'role', value: 'checkbox' },
        name: { type: 'string', value: 'Subscribe' },
        properties: [
          { name: 'checked', value: { type: 'boolean', value: true } },
          { name: 'disabled', value: { type: 'boolean', value: false } },
          { name: 'focused', value: { type: 'boolean', value: true } },
        ],
      },
    ];
    const tree = parseAccessibilityTree(nodes);

    const registry = assignRefs(tree);

    expect(registry.elements[0]).toMatchObject({
      checked: true,
      disabled: false,
      focused: true,
    });
  });

  it('skips generic/presentation roles', () => {
    const nodes: CDPAXNode[] = [
      { nodeId: 'n1', ignored: false, role: { type: 'role', value: 'generic' } },
      { nodeId: 'n2', ignored: false, role: { type: 'role', value: 'presentation' } },
      { nodeId: 'n3', ignored: false, role: { type: 'role', value: 'none' } },
      { nodeId: 'n4', ignored: false, role: { type: 'role', value: 'button' } },
    ];
    const tree = parseAccessibilityTree(nodes);

    const registry = assignRefs(tree);

    // Only button should be included
    expect(registry.elements).toHaveLength(1);
    expect(registry.elements[0]?.role).toBe('button');
  });
});
