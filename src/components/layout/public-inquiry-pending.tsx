export const PUBLIC_INQUIRY_PENDING_COPY = "Starting conversation…";
export const PUBLIC_INQUIRY_PREPARING_COPY = "Event Assistant is preparing your response…";

export function PublicInquiryPendingBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-md border border-border bg-muted/60 px-4 py-3 text-sm text-foreground"
    >
      <span
        className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
        aria-hidden
      />
      <span>{PUBLIC_INQUIRY_PREPARING_COPY}</span>
    </div>
  );
}
