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

export function formatDashboardGreeting(greetingName: string, timeZone: string, now = new Date()): string {
  const period = greetingPeriod(timeZone, now);
  const prefix =
    period === "morning" ? "Good morning" : period === "afternoon" ? "Good afternoon" : "Good evening";
  return `${prefix}, ${greetingName}`;
}

export function formatDashboardDateLabel(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(now);
}
