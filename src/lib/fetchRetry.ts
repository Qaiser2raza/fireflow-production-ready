// ==========================================
// FETCH RETRY UTILITY
// ==========================================
// Location: src/shared/lib/fetchRetry.ts
// Purpose: Exponential backoff for API calls

interface RetryOptions {
  retries?: number;
  backoffMs?: number;
  onRetry?: (attempt: number, error: any) => void;
}

/**
 * Fetch with exponential backoff retry
 * 
 * @param url - API endpoint
 * @param options - Fetch options
 * @param retryOptions - Retry configuration
 * @returns Response or throws after max retries
 * 
 * @example
 * const response = await fetchWithRetry('/api/config', {
 *   method: 'PATCH',
 *   body: JSON.stringify(data)
 * }, { retries: 3 });
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const {
    retries = 3,
    backoffMs = 1000,
    onRetry
  } = retryOptions;

  let lastError: any;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Don't retry on client errors (4xx) except 429 (rate limit)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return response;
      }

      // Success or retryable error
      if (response.ok || attempt === retries - 1) {
        return response;
      }

      // Server error - retry
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);

    } catch (error) {
      lastError = error;

      // Don't retry on last attempt
      if (attempt === retries - 1) {
        throw error;
      }
    }

    // Calculate backoff delay (exponential: 1s, 2s, 4s, 8s...)
    const delay = backoffMs * Math.pow(2, attempt);

    // Call retry callback if provided
    if (onRetry) {
      onRetry(attempt + 1, lastError);
    }

    // Wait before retrying
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Fetch JSON with retry
 * Convenience wrapper that parses JSON response
 * 
 * @example
 * const data = await fetchJSONWithRetry('/api/config');
 */
export async function fetchJSONWithRetry<T = any>(
  url: string,
  options?: RequestInit,
  retryOptions?: RetryOptions
): Promise<T> {
  const response = await fetchWithRetry(url, options, retryOptions);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}