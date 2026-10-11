import type { ReactNode } from "react";

/** Shell is composed per-page so trusted organization names can reach PublicCustomerShell. */
export default function PublicInquireLayout({ children }: { children: ReactNode }) {
  return children;
}
