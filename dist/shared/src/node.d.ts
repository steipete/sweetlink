export interface ResolveSweetLinkSecretOptions {
    readonly autoCreate?: boolean;
    readonly secretPath?: string;
}
export interface SweetLinkSecretResolution {
    readonly secret: string;
    readonly source: 'env' | 'file' | 'generated';
    readonly path?: string;
}
export declare function resolveSweetLinkSecret(options?: ResolveSweetLinkSecretOptions): Promise<SweetLinkSecretResolution>;
export declare function getDefaultSweetLinkSecretPath(): string;
//# sourceMappingURL=node.d.ts.map