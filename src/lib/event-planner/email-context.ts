export type PersonalEventPlanNotification = {
  to: string;
  customerName: string;
  organizationName: string;
  planUrl: string;
  eventDate: string | null;
};

export function personalEventPlanNotification(input: {
  customerEmail: string;
  customerFirstName?: string | null;
  customerLastName?: string | null;
  organizationName: string;
  planPath: string;
  appUrl: string;
  eventDate: string | null;
}): PersonalEventPlanNotification {
  const name = [input.customerFirstName, input.customerLastName].filter(Boolean).join(" ").trim();
  const origin = input.appUrl.replace(/\/+$/, "");
  const path = input.planPath.startsWith("/") ? input.planPath : `/${input.planPath}`;
  return {
    to: input.customerEmail,
    customerName: name || input.customerEmail,
    organizationName: input.organizationName,
    planUrl: `${origin}${path}`,
    eventDate: input.eventDate,
  };
}
