interface CodenameOptions {
    readonly slugFactory?: () => string;
    readonly saltFactory?: () => string;
    readonly timestampFactory?: () => number;
}
export declare function generateSessionCodename(existing: Iterable<string>, options?: CodenameOptions): string;
export {};
//# sourceMappingURL=codename.d.ts.map