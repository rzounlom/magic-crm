import type { ReactNode } from "react";

import { PublicCustomerShell } from "@/components/layout/public-customer-shell";

export default function PublicPlanLayout({ children }: { children: ReactNode }) {
  return <PublicCustomerShell>{children}</PublicCustomerShell>;
}
