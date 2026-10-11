import type { ReactNode } from "react";

/** Shell is composed per-page so trusted organization names can reach PublicCustomerShell. */
export default function PublicPlanLayout({ children }: { children: ReactNode }) {
  return children;
}
