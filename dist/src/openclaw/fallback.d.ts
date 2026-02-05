/**
 * Wraps an OpenClaw operation with fallback logic.
 * If the operation fails due to connectivity, logs a warning and returns null
 * so the caller can fall back to native SweetLink behavior.
 */
export declare function withOpenClawFallback<T>(operation: () => Promise<T>, operationName: string): Promise<T | null>;
//# sourceMappingURL=fallback.d.ts.map