"use client";

type RuntimeImporter = (specifier: string) => Promise<unknown>;

let runtimeImporter: RuntimeImporter | null = null;

const getRuntimeImporter = (): RuntimeImporter => {
  if (!runtimeImporter) {
    // Turbopack tries to statically analyse bare dynamic imports and treats blob URLs as <dynamic> modules.
    // Wrapping the import call in a Function keeps it purely runtime so blob-based scripts bypass module resolution.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    runtimeImporter = new Function("specifier", "return import(specifier);") as RuntimeImporter;
  }
  return runtimeImporter;
};

export async function loadModuleFromUrl<T = unknown>(url: string): Promise<T> {
  return (await getRuntimeImporter()(url)) as T;
}

export async function loadDefaultExportFromUrl<T>(url: string): Promise<T> {
  const loadedModule = await loadModuleFromUrl<{ default?: T }>(url);
  const defaultExport = loadedModule.default;
  if (defaultExport === undefined) {
    throw new TypeError(`Module loaded from URL "${url}" does not have a default export`);
  }
  return defaultExport;
}

export function setRuntimeImporterForTesting(importer: RuntimeImporter | null): void {
  runtimeImporter = importer;
}
