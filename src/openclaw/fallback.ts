import { OpenClawError } from './types.js';

/**
 * Wraps an OpenClaw operation with fallback logic.
 * If the operation fails due to connectivity, logs a warning and returns null
 * so the caller can fall back to native SweetLink behavior.
 */
export async function withOpenClawFallback<T>(
  operation: () => Promise<T>,
  operationName: string,
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    const isConnectivity =
      error instanceof OpenClawError
        ? error.statusCode === 503 || error.statusCode === 409
        : isNetworkError(error);

    if (isConnectivity) {
      console.warn(
        `[sweetlink] OpenClaw unavailable for ${operationName}, falling back to native.`,
      );
      console.warn('Hint: check OpenClaw status with `sweetlink openclaw-status`.');
      return null;
    }
    throw error;
  }
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('fetch failed')
  );
}
