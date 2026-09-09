export function bookingNumberPrefix(organizationSlug: string): string {
  const letters = organizationSlug.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const prefix = letters.slice(0, 3);
  return prefix.padEnd(3, "X") || "EVT";
}

export function formatBookingNumber(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(5, "0")}`;
}
