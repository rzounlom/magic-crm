/**
 * Customer-facing inquiry acknowledgment copy.
 * Must not include prices, private calculations, availability promises, or booking claims.
 */

export type InquiryAcknowledgmentContent = {
  subject: string;
  textBody: string;
  htmlBody: string;
};

export function buildInquiryAcknowledgmentEmail(input: {
  organizationName: string;
  customerFirstName?: string | null;
  customerLastName?: string | null;
}): InquiryAcknowledgmentContent {
  const org = input.organizationName.trim() || "our venue";
  const first = (input.customerFirstName ?? "").trim();
  const greeting = first ? `Hi ${first},` : "Hello,";
  const subject = "We received your event request";
  const textBody = [
    greeting,
    "",
    `Thank you for submitting your event request to ${org}.`,
    "",
    "Our Events Team has received your inquiry and will review the details you shared.",
    "An employee will follow up soon with next steps.",
    "",
    "This message confirms we received your request only.",
    "It does not reserve a date, confirm pricing, or book your event.",
    "",
    `— ${org}`,
  ].join("\n");

  const htmlBody = [
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>Thank you for submitting your event request to <strong>${escapeHtml(org)}</strong>.</p>`,
    `<p>Our Events Team has received your inquiry and will review the details you shared. An employee will follow up soon with next steps.</p>`,
    `<p>This message confirms we received your request only. It does not reserve a date, confirm pricing, or book your event.</p>`,
    `<p>— ${escapeHtml(org)}</p>`,
  ].join("");

  return { subject, textBody, htmlBody };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Forbidden content checks for acknowledgment safety tests / guards. */
export function inquiryAcknowledgmentContainsForbiddenContent(body: string): boolean {
  const lower = body.toLowerCase();
  const needles = [
    "$",
    "cents",
    "deposit",
    "payment link",
    "your event is booked",
    "confirmed reservation",
    "availability is held",
    "held for you",
    "private calculation",
    "pricing source",
    "plugin_defaults",
    "tenant_live",
    "approved_plugin_baseline",
    "/plan/",
    "estimated total",
  ];
  return needles.some((needle) => lower.includes(needle));
}
