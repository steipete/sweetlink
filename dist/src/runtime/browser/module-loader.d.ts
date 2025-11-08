type RuntimeImporter = (specifier: string) => Promise<unknown>;
export declare function loadModuleFromUrl<T = unknown>(url: string): Promise<T>;
export declare function loadDefaultExportFromUrl<T>(url: string): Promise<T>;
export declare function setRuntimeImporterForTesting(importer: RuntimeImporter | null): void;
export {};
//# sourceMappingURL=module-loader.d.ts.map