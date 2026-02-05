import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readCommandOptionsMock = vi.fn();
const loadDevToolsConfigMock = vi.fn();
const connectToDevToolsMock = vi.fn();
const fetchAccessibilityTreeMock = vi.fn();
const assignRefsMock = vi.fn();
const formatSnapshotMock = vi.fn();
const formatSnapshotAriaMock = vi.fn();

vi.mock('../../src/core/env', () => ({
  readCommandOptions: readCommandOptionsMock,
}));

vi.mock('../../src/runtime/devtools', () => ({
  loadDevToolsConfig: loadDevToolsConfigMock,
  connectToDevTools: connectToDevToolsMock,
}));

vi.mock('../../src/snapshot/accessibility', () => ({
  fetchAccessibilityTree: fetchAccessibilityTreeMock,
}));

vi.mock('../../src/snapshot/refs', () => ({
  assignRefs: assignRefsMock,
}));

vi.mock('../../src/snapshot/formatter', () => ({
  formatSnapshot: formatSnapshotMock,
  formatSnapshotAria: formatSnapshotAriaMock,
}));

const { registerAiSnapshotCommand } = await import('../../src/commands/ai-snapshot');

const mockTree = { nodes: [], nodeMap: new Map(), rootIds: [] };
const mockRegistry = { elements: [], refMap: new Map(), nodeIdMap: new Map() };
const mockResult = {
  output: 'button "Submit" [ref:e1]',
  truncated: false,
  stats: { lines: 1, chars: 25, elements: 1, interactive: 1 },
};

describe('registerAiSnapshotCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws error when no DevTools config', async () => {
    const program = new Command();
    registerAiSnapshotCommand(program);

    readCommandOptionsMock.mockReturnValue({});
    loadDevToolsConfigMock.mockResolvedValue(null);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(program.parseAsync(['ai-snapshot'], { from: 'user' })).rejects.toThrow(
      'No DevTools connection available'
    );

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('captures snapshot with default options', async () => {
    const program = new Command();
    registerAiSnapshotCommand(program);

    readCommandOptionsMock.mockReturnValue({});
    loadDevToolsConfigMock.mockResolvedValue({ devtoolsUrl: 'http://127.0.0.1:9222' });
    connectToDevToolsMock.mockResolvedValue({ page: {} });
    fetchAccessibilityTreeMock.mockResolvedValue(mockTree);
    assignRefsMock.mockReturnValue(mockRegistry);
    formatSnapshotMock.mockReturnValue(mockResult);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['ai-snapshot'], { from: 'user' });

    expect(fetchAccessibilityTreeMock).toHaveBeenCalled();
    expect(assignRefsMock).toHaveBeenCalledWith(mockTree, expect.objectContaining({ interactiveOnly: false }));
    expect(formatSnapshotMock).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(mockResult.output);

    logSpy.mockRestore();
  });

  it('uses interactive-only mode when flag is set', async () => {
    const program = new Command();
    registerAiSnapshotCommand(program);

    readCommandOptionsMock.mockReturnValue({ interactive: true, depth: 50 });
    loadDevToolsConfigMock.mockResolvedValue({ devtoolsUrl: 'http://127.0.0.1:9222' });
    connectToDevToolsMock.mockResolvedValue({ page: {} });
    fetchAccessibilityTreeMock.mockResolvedValue(mockTree);
    assignRefsMock.mockReturnValue(mockRegistry);
    formatSnapshotMock.mockReturnValue(mockResult);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['ai-snapshot', '--interactive'], { from: 'user' });

    expect(assignRefsMock).toHaveBeenCalledWith(mockTree, expect.objectContaining({ interactiveOnly: true }));

    logSpy.mockRestore();
  });

  it('uses ARIA format when specified', async () => {
    const program = new Command();
    registerAiSnapshotCommand(program);

    readCommandOptionsMock.mockReturnValue({ format: 'aria' });
    loadDevToolsConfigMock.mockResolvedValue({ devtoolsUrl: 'http://127.0.0.1:9222' });
    connectToDevToolsMock.mockResolvedValue({ page: {} });
    fetchAccessibilityTreeMock.mockResolvedValue(mockTree);
    assignRefsMock.mockReturnValue(mockRegistry);
    formatSnapshotAriaMock.mockReturnValue(mockResult);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['ai-snapshot', '--format', 'aria'], { from: 'user' });

    expect(formatSnapshotAriaMock).toHaveBeenCalled();
    expect(formatSnapshotMock).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('respects depth option', async () => {
    const program = new Command();
    registerAiSnapshotCommand(program);

    readCommandOptionsMock.mockReturnValue({ depth: 10 });
    loadDevToolsConfigMock.mockResolvedValue({ devtoolsUrl: 'http://127.0.0.1:9222' });
    connectToDevToolsMock.mockResolvedValue({ page: {} });
    fetchAccessibilityTreeMock.mockResolvedValue(mockTree);
    assignRefsMock.mockReturnValue(mockRegistry);
    formatSnapshotMock.mockReturnValue(mockResult);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['ai-snapshot', '--depth', '10'], { from: 'user' });

    expect(assignRefsMock).toHaveBeenCalledWith(mockTree, expect.objectContaining({ maxDepth: 10 }));
    expect(formatSnapshotMock).toHaveBeenCalledWith(mockRegistry, expect.objectContaining({ maxDepth: 10 }));

    logSpy.mockRestore();
  });
});
