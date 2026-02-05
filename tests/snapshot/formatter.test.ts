import { describe, expect, it } from 'vitest';
import { parseAccessibilityTree, type CDPAXNode } from '../../src/snapshot/accessibility.js';
import { formatSnapshot, formatSnapshotAria } from '../../src/snapshot/formatter.js';
import { assignRefs } from '../../src/snapshot/refs.js';

function buildRegistry(nodes: CDPAXNode[]) {
  const tree = parseAccessibilityTree(nodes);
  return assignRefs(tree);
}

describe('formatSnapshot', () => {
  it('formats empty registry', () => {
    const registry = buildRegistry([]);

    const result = formatSnapshot(registry);

    expect(result.output).toBe('');
    expect(result.truncated).toBe(false);
    expect(result.stats.elements).toBe(0);
  });

  it('formats single element', () => {
    const registry = buildRegistry([
      { nodeId: 'n1', ignored: false, role: { type: 'role', value: 'button' }, name: { type: 'string', value: 'Submit' } },
    ]);

    const result = formatSnapshot(registry);

    expect(result.output).toBe('button "Submit" [ref:e1]');
    expect(result.stats.lines).toBe(1);
    expect(result.stats.interactive).toBe(1);
  });

  it('omits refs when includeRefs is false', () => {
    const registry = buildRegistry([
      { nodeId: 'n1', ignored: false, role: { type: 'role', value: 'button' }, name: { type: 'string', value: 'OK' } },
    ]);

    const result = formatSnapshot(registry, { includeRefs: false });

    expect(result.output).toBe('button "OK"');
    expect(result.output).not.toContain('[ref:');
  });

  it('indents nested elements', () => {
    const registry = buildRegistry([
      { nodeId: 'root', ignored: false, role: { type: 'role', value: 'main' }, childIds: ['btn'] },
      { nodeId: 'btn', ignored: false, role: { type: 'role', value: 'button' }, name: { type: 'string', value: 'Go' } },
    ]);

    const result = formatSnapshot(registry);

    const lines = result.output.split('\n');
    expect(lines[0]).toMatch(/^main/);
    expect(lines[1]).toMatch(/^  button/);
  });

  it('includes state attributes', () => {
    const registry = buildRegistry([
      {
        nodeId: 'n1',
        ignored: false,
        role: { type: 'role', value: 'checkbox' },
        name: { type: 'string', value: 'Remember' },
        properties: [
          { name: 'checked', value: { type: 'boolean', value: true } },
          { name: 'disabled', value: { type: 'boolean', value: true } },
        ],
      },
    ]);

    const result = formatSnapshot(registry);

    expect(result.output).toContain('checked');
    expect(result.output).toContain('disabled');
  });

  it('includes value attribute when different from name', () => {
    const registry = buildRegistry([
      {
        nodeId: 'n1',
        ignored: false,
        role: { type: 'role', value: 'textbox' },
        name: { type: 'string', value: 'Email' },
        value: { type: 'string', value: 'user@example.com' },
      },
    ]);

    const result = formatSnapshot(registry);

    expect(result.output).toContain('value="user@example.com"');
  });

  it('escapes quotes in names', () => {
    const registry = buildRegistry([
      { nodeId: 'n1', ignored: false, role: { type: 'role', value: 'button' }, name: { type: 'string', value: 'Say "Hello"' } },
    ]);

    const result = formatSnapshot(registry);

    expect(result.output).toContain('\\"Hello\\"');
  });

  it('truncates long names', () => {
    const longName = 'A'.repeat(200);
    const registry = buildRegistry([
      { nodeId: 'n1', ignored: false, role: { type: 'role', value: 'heading' }, name: { type: 'string', value: longName } },
    ]);

    const result = formatSnapshot(registry);

    expect(result.output).toContain('...');
    expect(result.output.length).toBeLessThan(longName.length + 50);
  });

  it('respects maxDepth option', () => {
    const registry = buildRegistry([
      { nodeId: 'root', ignored: false, role: { type: 'role', value: 'main' }, childIds: ['deep'] },
      { nodeId: 'deep', ignored: false, role: { type: 'role', value: 'button' } },
    ]);

    const result = formatSnapshot(registry, { maxDepth: 0 });

    expect(result.stats.lines).toBe(1);
  });

  it('respects maxChars limit and sets truncated flag', () => {
    const registry = buildRegistry([
      { nodeId: 'n1', ignored: false, role: { type: 'role', value: 'button' }, name: { type: 'string', value: 'First' } },
      { nodeId: 'n2', ignored: false, role: { type: 'role', value: 'button' }, name: { type: 'string', value: 'Second' } },
      { nodeId: 'n3', ignored: false, role: { type: 'role', value: 'button' }, name: { type: 'string', value: 'Third' } },
    ]);

    const result = formatSnapshot(registry, { maxChars: 50 });

    expect(result.truncated).toBe(true);
    expect(result.stats.lines).toBeLessThan(3);
  });

  it('compact mode skips elements without names', () => {
    const registry = buildRegistry([
      { nodeId: 'n1', ignored: false, role: { type: 'role', value: 'region' } },
      { nodeId: 'n2', ignored: false, role: { type: 'role', value: 'button' }, name: { type: 'string', value: 'Click' } },
    ]);

    const result = formatSnapshot(registry, { compact: true });

    // Only button has a name or is interactive
    expect(result.stats.lines).toBe(1);
    expect(result.output).toContain('button');
  });

  it('counts interactive elements correctly', () => {
    const registry = buildRegistry([
      { nodeId: 'n1', ignored: false, role: { type: 'role', value: 'heading' }, name: { type: 'string', value: 'Title' } },
      { nodeId: 'n2', ignored: false, role: { type: 'role', value: 'button' } },
      { nodeId: 'n3', ignored: false, role: { type: 'role', value: 'link' } },
      { nodeId: 'n4', ignored: false, role: { type: 'role', value: 'textbox' } },
    ]);

    const result = formatSnapshot(registry);

    expect(result.stats.interactive).toBe(3);
  });
});

describe('formatSnapshotAria', () => {
  it('uses ARIA-style format', () => {
    const registry = buildRegistry([
      { nodeId: 'n1', ignored: false, role: { type: 'role', value: 'button' }, name: { type: 'string', value: 'Submit' } },
    ]);

    const result = formatSnapshotAria(registry);

    expect(result.output).toContain('[button]');
    expect(result.output).toContain('name="Submit"');
    expect(result.output).toContain('ref=e1');
  });

  it('includes description in ARIA format', () => {
    const registry = buildRegistry([
      {
        nodeId: 'n1',
        ignored: false,
        role: { type: 'role', value: 'button' },
        name: { type: 'string', value: 'OK' },
        description: { type: 'string', value: 'Confirm action' },
      },
    ]);

    const result = formatSnapshotAria(registry);

    expect(result.output).toContain('desc="Confirm action"');
  });

  it('includes state in ARIA format', () => {
    const registry = buildRegistry([
      {
        nodeId: 'n1',
        ignored: false,
        role: { type: 'role', value: 'checkbox' },
        properties: [
          { name: 'checked', value: { type: 'boolean', value: true } },
          { name: 'focused', value: { type: 'boolean', value: true } },
        ],
      },
    ]);

    const result = formatSnapshotAria(registry);

    expect(result.output).toContain('state={checked,focused}');
  });

  it('respects maxChars in ARIA format', () => {
    const registry = buildRegistry([
      { nodeId: 'n1', ignored: false, role: { type: 'role', value: 'button' } },
      { nodeId: 'n2', ignored: false, role: { type: 'role', value: 'button' } },
      { nodeId: 'n3', ignored: false, role: { type: 'role', value: 'button' } },
    ]);

    const result = formatSnapshotAria(registry, { maxChars: 30 });

    expect(result.truncated).toBe(true);
  });
});
