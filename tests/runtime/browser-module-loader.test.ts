import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRecord } from '../../src/runtime/browser/utils/object';
import {
  loadDefaultExportFromUrl,
  loadModuleFromUrl,
  setRuntimeImporterForTesting,
} from '../../src/runtime/browser/module-loader';

type RuntimeImporter = (url: string) => Promise<unknown>;

const resolveRuntimeImporterResult = (value: unknown): { value: number } => {
  if (!isRecord<{ value?: unknown }>(value)) {
    throw new TypeError('Expected module loader result object.');
  }
  if (typeof value.value !== 'number') {
    throw new TypeError('Expected module loader result with value number.');
  }
  return { value: value.value };
};

describe('runtime module-loader', () => {
  afterEach(() => {
    setRuntimeImporterForTesting(null);
  });

  it('delegates module loading to the injected runtime importer', async () => {
    const importer = vi.fn<RuntimeImporter>().mockResolvedValue({ value: 42 });
    setRuntimeImporterForTesting(importer);

    const result = resolveRuntimeImporterResult(await loadModuleFromUrl('blob:module'));

    expect(result).toEqual({ value: 42 });
    expect(importer).toHaveBeenCalledWith('blob:module');
  });

  it('extracts the default export when available', async () => {
    const importer = vi.fn<RuntimeImporter>().mockResolvedValue({ default: 'hook-runner' });
    setRuntimeImporterForTesting(importer);

    const result = await loadDefaultExportFromUrl<string>('blob:module');

    expect(result).toBe('hook-runner');
  });

  it('throws when the loaded module lacks a default export', async () => {
    const importer = vi.fn<RuntimeImporter>().mockResolvedValue({ notDefault: true });
    setRuntimeImporterForTesting(importer);

    await expect(loadDefaultExportFromUrl('blob:missing')).rejects.toThrow(
      'Module loaded from URL "blob:missing" does not have a default export'
    );
  });
});
