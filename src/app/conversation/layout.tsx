import type { ReactNode } from "react";

import { PublicCustomerShell } from "@/components/layout/public-customer-shell";

export default function PublicConversationLayout({ children }: { children: ReactNode }) {
  return <PublicCustomerShell>{children}</PublicCustomerShell>;
}
