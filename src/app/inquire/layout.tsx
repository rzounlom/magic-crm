import type { ReactNode } from "react";

import { PublicCustomerShell } from "@/components/layout/public-customer-shell";

export default function PublicInquireLayout({ children }: { children: ReactNode }) {
  return <PublicCustomerShell>{children}</PublicCustomerShell>;
}
