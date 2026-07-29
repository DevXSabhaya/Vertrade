/**
 * Races `operation` against a timer that rejects after `timeoutMs`. Bounds
 * how long the *caller* waits — it cannot cancel the underlying operation
 * (there is no universal cancellation primitive across HTTP clients/SDKs),
 * but the caller is guaranteed to get control back by the deadline
 * regardless of what the stuck operation is doing.
 *
 * Exists because Node has no default timeout for a stalled outbound
 * connection: a request that never receives a response (blocked port,
 * silently dropped packets, a hung upstream) can otherwise wait
 * indefinitely. Any external network call — an SMTP socket, an HTTPS API
 * request — needs this same guarantee, so it lives here rather than being
 * duplicated per call site.
 */
export function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
