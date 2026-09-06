const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export class ApplicationUrlError extends Error {
  constructor(message = "APP_URL must be an absolute http(s) origin.") {
    super(message);
    this.name = "ApplicationUrlError";
  }
}

function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname.toLowerCase());
}

/**
 * Trusted application origin from server configuration.
 * Rejects credentials, query strings, fragments, and non-local http.
 */
export function parseApplicationOrigin(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    throw new ApplicationUrlError("APP_URL is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ApplicationUrlError();
  }

  if (parsed.username || parsed.password) {
    throw new ApplicationUrlError();
  }

  if (parsed.search || parsed.hash) {
    throw new ApplicationUrlError();
  }

  if (parsed.pathname && parsed.pathname !== "/") {
    throw new ApplicationUrlError();
  }

  const protocol = parsed.protocol;
  const hostname = parsed.hostname;
  if (!hostname) {
    throw new ApplicationUrlError();
  }

  if (protocol === "http:") {
    if (!isLocalHostname(hostname)) {
      throw new ApplicationUrlError("APP_URL may use http only for localhost.");
    }
  } else if (protocol !== "https:") {
    throw new ApplicationUrlError();
  }

  const origin = parsed.origin;
  if (origin === "null") {
    throw new ApplicationUrlError();
  }

  return origin;
}
