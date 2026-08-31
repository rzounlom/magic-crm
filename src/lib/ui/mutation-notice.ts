import type { SecurityActionResult } from "@/types/security-action";

export type MutationNoticeCopy = {
  successTitle: string;
  successDescription?: string;
  errorTitle: string;
};

export type MutationNotice = {
  tone: "success" | "error";
  title: string;
  description: string;
  refresh: boolean;
  redirectTo?: string;
};

export function mutationNotice(
  result: SecurityActionResult,
  copy: MutationNoticeCopy,
): MutationNotice {
  if (result.ok) {
    return {
      tone: "success",
      title: result.title ?? copy.successTitle,
      description: copy.successDescription ?? result.message ?? "",
      refresh: true,
      redirectTo: result.redirectTo,
    };
  }

  if (result.code === "LAST_ADMIN_REQUIRED") {
    return {
      tone: "error",
      title: result.title ?? "Unable to remove member",
      description: result.message,
      refresh: false,
    };
  }

  return {
    tone: "error",
    title: result.title ?? copy.errorTitle,
    description: result.message,
    refresh: false,
  };
}
