/**
 * Small PHP-semantics helpers used by the WP Event Planner 3.3.0 engine port.
 * These exist only so the TypeScript port can mirror PHP behavior literally.
 */

/**
 * PHP `round()` to zero decimals: half away from zero, with PHP's pre-rounding
 * (value is first normalised to 15 significant digits) so float noise such as
 * 2849.0000000000005 or 12.499999999999998 behaves like PHP < 8.4.
 */
export function phpRound(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  const pre = Number(Math.abs(value).toPrecision(15));
  const rounded = Math.round(pre);
  return value < 0 && rounded !== 0 ? -rounded : rounded;
}

/** PHP `trim()` default character set: " \t\n\r\0\x0B". */
export function phpTrim(value: string): string {
  return value.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "");
}

/** PHP 8 `strtolower()` is ASCII-only. */
export function phpStrToLower(value: string): string {
  return value.replace(/[A-Z]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 32));
}

/** PHP `strlen()` counts bytes. */
export function phpStrlen(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

/** PHP `self::scalar()` in the engine: string, int or float (not bool/null/array). */
export function isPhpScalar(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

/** PHP `is_numeric()`. */
export function phpIsNumeric(value: unknown): boolean {
  if (typeof value === "number") {
    return true;
  }
  if (typeof value !== "string") {
    return false;
  }
  return /^[ \t\n\r\v\f]*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[ \t\n\r\v\f]*$/.test(value);
}

/** PHP `(float)` cast for scalars (leading-numeric string semantics). */
export function phpFloat(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value !== "string") {
    return 0;
  }
  const match = /^[ \t\n\r\v\f]*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/.exec(value);
  return match ? Number(match[1]) : 0;
}

/** PHP `(int)` cast for scalars. */
export function phpInt(value: unknown): number {
  const n = phpFloat(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  const t = Math.trunc(n);
  return t === 0 ? 0 : t;
}

/** PHP `number_format($cents / 100, 2)` for the engine's `money()`. */
export function phpMoneyFromCents(cents: number): string {
  const rounded = phpRound(cents);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${negative ? "-" : ""}${grouped}.${frac}`;
}

/**
 * PHP `json_encode()` defaults for the value shapes used by package definitions:
 * escapes "/" and non-ASCII as \uXXXX, matching PHP output byte-for-byte.
 */
export function phpJsonEncode(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return phpJsonString(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => phpJsonEncode(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return "[]";
    }
    return `{${entries.map(([k, v]) => `${phpJsonString(k)}:${phpJsonEncode(v)}`).join(",")}}`;
  }
  return "null";
}

function phpJsonString(value: string): string {
  let out = '"';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i] as string;
    const code = value.charCodeAt(i);
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "/") out += "\\/";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (code < 0x20 || code > 0x7f) {
      out += `\\u${code.toString(16).padStart(4, "0")}`;
    } else out += ch;
  }
  return `${out}"`;
}

/** PHP `(new DateTimeImmutable($date))->format('N')` for a `YYYY-MM-DD` date: 1=Mon..7=Sun. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split("-").map((part) => Number(part)) as [number, number, number];
  const utc = new Date(0);
  utc.setUTCFullYear(y, m - 1, d);
  const dow = utc.getUTCDay();
  return dow === 0 ? 7 : dow;
}
