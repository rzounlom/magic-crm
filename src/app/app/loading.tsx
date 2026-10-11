import { AuthWorkspaceTransition } from "@/components/auth/auth-workspace-transition";

export default function EmployeeAppLoading() {
  return <AuthWorkspaceTransition phase="loading_workspace" />;
}
