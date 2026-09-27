export type DatabaseTarget = {
  host: string;
  endpoint: string;
  database: string;
};

export type SanitizedDatabaseTarget = {
  host: string;
  database: string;
};

/**
 * Identity ignores credentials, the Neon `-pooler` host suffix, port, and query
 * string. A pooled URL and a direct URL for the same branch are the same database.
 */
export function databaseTargetFromUrl(raw: string | null | undefined): DatabaseTarget | null {
  const value = raw?.trim();
  if (!value) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!host || !database) {
    return null;
  }
  return {
    host,
    endpoint: host.replace(/-pooler(?=\.)/, ""),
    database,
  };
}

export function databaseIdentity(target: DatabaseTarget | null): string | null {
  if (!target) {
    return null;
  }
  return `${target.endpoint}/${target.database}`;
}

export function sanitizeDatabaseTarget(target: DatabaseTarget | null): SanitizedDatabaseTarget | null {
  if (!target) {
    return null;
  }
  return { host: target.host, database: target.database };
}

export function databaseTargetsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const leftIdentity = databaseIdentity(databaseTargetFromUrl(left));
  const rightIdentity = databaseIdentity(databaseTargetFromUrl(right));
  return Boolean(leftIdentity && rightIdentity && leftIdentity === rightIdentity);
}
