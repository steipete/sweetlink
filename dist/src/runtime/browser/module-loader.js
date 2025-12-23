'use client';
let runtimeImporter = null;
const getRuntimeImporter = () => {
    if (!runtimeImporter) {
        // Turbopack tries to statically analyse bare dynamic imports and treats blob URLs as <dynamic> modules.
        // Wrapping the import call in a Function keeps it purely runtime so blob-based scripts bypass module resolution.
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        runtimeImporter = new Function('specifier', 'return import(specifier);');
    }
    return runtimeImporter;
};
export async function loadModuleFromUrl(url) {
    return (await getRuntimeImporter()(url));
}
export async function loadDefaultExportFromUrl(url) {
    const loadedModule = await loadModuleFromUrl(url);
    const defaultExport = loadedModule.default;
    if (defaultExport === undefined) {
        throw new TypeError(`Module loaded from URL "${url}" does not have a default export`);
    }
    return defaultExport;
}
export function setRuntimeImporterForTesting(importer) {
    runtimeImporter = importer;
}
//# sourceMappingURL=module-loader.js.map