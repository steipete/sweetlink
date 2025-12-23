/** Extracts a readable message from unknown error-like values. */
export declare function extractEventMessage(event: unknown, prefix?: string): string;
/** Type guard for Node errno exceptions. */
export declare function isErrnoException(value: unknown): value is NodeJS.ErrnoException;
/** Formats unknown values for human-readable logging. */
export declare function describeUnknown(value: unknown, fallback?: string): string;
/** Emits a warning when debug logging is enabled. */
export declare function logDebugError(context: string, error: unknown): void;
//# sourceMappingURL=errors.d.ts.map