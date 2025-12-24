// @vitest-environment jsdom
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sweetLinkBrowserTestHelpers } from '../../src/runtime/browser';
import { setRuntimeImporterForTesting } from '../../src/runtime/browser/module-loader';

type HookRunner = (windowRef: Window, documentRef: Document, target: HTMLElement) => unknown;
type RuntimeImporterResult = { default: HookRunner };
type RuntimeImporter = (url: string) => Promise<RuntimeImporterResult>;

const { createHookRunner } = sweetLinkBrowserTestHelpers;

describe('createHookRunner', () => {
  let createObjectUrlSpy: MockInstance<typeof URL.createObjectURL>;
  let revokeObjectUrlSpy: MockInstance<typeof URL.revokeObjectURL>;
  let runtimeImporter: MockInstance<RuntimeImporter>;

  beforeEach(() => {
    runtimeImporter = vi.fn<RuntimeImporter>();
    setRuntimeImporterForTesting(runtimeImporter);
    createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {
      /* noop revoke for blob URLs */
    });
  });

  afterEach(() => {
    setRuntimeImporterForTesting(null);
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });

  it('executes compiled hooks with the provided targets', async () => {
    const hook = vi.fn<HookRunner>();
    runtimeImporter.mockResolvedValue({ default: hook });

    const runner = createHookRunner('globalThis.__hookExecuted = true;');
    const clientWindow = globalThis.window;
    const documentTarget = document;
    const target = document.createElement('div');

    await runner(clientWindow, documentTarget, target);

    expect(hook).toHaveBeenCalledWith(clientWindow, documentTarget, target);
    expect(runtimeImporter).toHaveBeenCalledWith('blob:mock-url');
  });

  it('reuses the compiled module across multiple executions', async () => {
    const hook = vi.fn<HookRunner>();
    runtimeImporter.mockResolvedValue({ default: hook });

    const runner = createHookRunner('console.log("run")');

    const clientWindow = globalThis.window;
    await runner(clientWindow, document, document.createElement('div'));
    await runner(clientWindow, document, document.createElement('div'));

    expect(runtimeImporter).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledTimes(2);
  });
});
