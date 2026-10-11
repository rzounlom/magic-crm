import { AuthWorkspaceTransition } from "@/components/auth/auth-workspace-transition";

export default function SignInLoading() {
  return <AuthWorkspaceTransition phase="checking" />;
}
