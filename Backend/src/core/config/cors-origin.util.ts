/**
 * CORS origin resolution (Phase 13 fix). Kept as pure functions, independent
 * of Nest/Express, so the actual decision logic is unit-testable without
 * booting an app — `main.ts` only wires this into `enableCors()`.
 *
 * Root cause this exists to fix: the previous config compared the request's
 * `Origin` header against exactly one hardcoded string. Vite has no fixed
 * dev port — if the configured port is already taken (as it routinely is on
 * a machine running more than one frontend project), it silently falls back
 * to the next free port, so the real dev server's origin stops matching the
 * single configured value and every request is blocked by the browser.
 */

const LOCAL_DEV_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/;

/** Splits a comma-separated env value into trimmed, non-empty origins. */
export function parseAllowedOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/** True for any `http(s)://localhost:<port>` or `http(s)://127.0.0.1:<port>` origin, regardless of port number. */
export function isLocalDevOrigin(origin: string): boolean {
  return LOCAL_DEV_ORIGIN_PATTERN.test(origin);
}

export type CorsOriginCallback = (err: Error | null, allow?: boolean) => void;

/**
 * Builds the `origin` function `CorsOptions` accepts. Explicit
 * `allowedOrigins` are honored in every environment; the permissive "any
 * localhost port" fallback only ever applies when `isDevelopment` is true —
 * production always requires an exact, explicitly configured match, and
 * never falls back to a wildcard.
 */
export function createCorsOriginValidator(
  allowedOrigins: readonly string[],
  isDevelopment: boolean,
): (origin: string | undefined, callback: CorsOriginCallback) => void {
  return (origin, callback) => {
    // No Origin header at all means the caller isn't a browser enforcing
    // CORS in the first place (curl, server-to-server calls, health checks)
    // — nothing to restrict here.
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    if (isDevelopment && isLocalDevOrigin(origin)) {
      callback(null, true);
      return;
    }

    // `callback(null, false)` rather than an Error: an untrusted origin is
    // an expected, benign case (not a server fault), so the response stays
    // a normal 2xx/204 with no Access-Control-Allow-Origin header — the
    // browser still blocks it either way, but nothing gets logged as a 500
    // or an unhandled exception for what is routine, harmless traffic.
    callback(null, false);
  };
}
