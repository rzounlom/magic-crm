import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";

import { EmployeeShell } from "@/components/layout/employee-shell";

export default async function EmployeeAppLayout({ children }: { children: ReactNode }) {
  await auth.protect();

  return <EmployeeShell>{children}</EmployeeShell>;
}
