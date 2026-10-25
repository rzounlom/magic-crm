"use server";

import { unstable_rethrow } from "next/navigation";

import { db } from "@/lib/db";
import {
  isAuthorizationError,
  isCatalogSyncError,
  isTenantContextError,
} from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { applyCatalogSync } from "@/server/services/catalog-sync-admin-service";
import type { SecurityActionResult } from "@/types/security-action";

function toResult(error: unknown, title: string): SecurityActionResult {
  if (isAuthorizationError(error) || isTenantContextError(error) || isCatalogSyncError(error)) {
    return { ok: false, code: error.code, title, message: error.userMessage };
  }
  throw error;
}

export async function applyCatalogSyncAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const ctx = await getRequestContext();
    const confirmation = String(formData.get("confirmation") ?? "");
    const result = await applyCatalogSync(ctx, db, confirmation);
    return {
      ok: true,
      title: "Catalog updated",
      message: `Applied ${result.diff.products.created.length} creates and ${result.diff.products.updated.length} updates for ${result.organization.name}.`,
      refresh: true,
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to update catalog");
  }
}
