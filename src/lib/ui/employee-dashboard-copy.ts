function greetingPeriod(timeZone: string, now = new Date()): "morning" | "afternoon" | "evening" {
  const hourRaw = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone,
  }).format(now);
  const hour = Number.parseInt(hourRaw, 10);
  if (Number.isFinite(hour) && hour < 12) {
    return "morning";
  }
  if (Number.isFinite(hour) && hour < 17) {
    return "afternoon";
  }
  return "evening";
}

/**
 * Time-of-day greeting when a real first/display name is available.
 * When the name is missing, returns "Welcome back" — never "…, there" and never an email.
 */
export function formatDashboardGreeting(
  greetingName: string | null | undefined,
  timeZone: string,
  now = new Date(),
): string {
  const name = greetingName?.trim() ?? "";
  if (!name || name.toLowerCase() === "there") {
    return "Welcome back";
  }
  const period = greetingPeriod(timeZone, now);
  const prefix =
    period === "morning" ? "Good morning" : period === "afternoon" ? "Good afternoon" : "Good evening";
  return `${prefix}, ${name}`;
}

export function formatDashboardDateLabel(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(now);
}
