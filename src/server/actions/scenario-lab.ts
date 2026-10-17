"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";

import { readTrustedClerkAuth } from "@/lib/auth/trusted-clerk-auth";
import { db } from "@/lib/db";
import { requireScenarioLabAccess } from "@/server/scenario-lab/authorize-scenario-lab";
import { isScenarioLabError } from "@/server/scenario-lab/errors";
import {
  createCustomerInquiryScenarioRun,
  markScenarioLabPublicIntakeOpened,
} from "@/server/scenario-lab/run-service";
import type { SecurityActionResult } from "@/types/security-action";

async function requireLabAccess() {
  const auth = await readTrustedClerkAuth();
  return requireScenarioLabAccess({
    auth,
    database: db,
    resolveOrganizationName: async (organizationId) => {
      const org = await db.organization.findFirst({
        where: { id: organizationId },
        select: { name: true },
      });
      return org?.name ?? null;
    },
  });
}

export async function createScenarioLabInquiryRunAction(
  formData: FormData,
): Promise<SecurityActionResult> {
  try {
    const access = await requireLabAccess();
    const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();
    const eventDate = String(formData.get("eventDate") ?? "").trim() || undefined;
    const guestCountRaw = String(formData.get("guestCount") ?? "").trim();
    const guestCount = guestCountRaw ? Number(guestCountRaw) : undefined;
    const eventType = String(formData.get("eventType") ?? "").trim() || undefined;

    const created = await createCustomerInquiryScenarioRun(access.request, db, {
      idempotencyKey,
      eventDate,
      guestCount: Number.isFinite(guestCount) ? guestCount : undefined,
      eventType,
    });

    revalidatePath("/scenario-lab");
    revalidatePath(`/scenario-lab/runs/${created.runId}`);

    return {
      ok: true,
      title: created.reused ? "Existing run reused" : "Scenario run created",
      message: created.reused
        ? "An identical create request reused the existing run."
        : "Synthetic customer fixture is ready for public intake.",
      redirectTo: `/scenario-lab/runs/${created.runId}`,
    };
  } catch (error) {
    unstable_rethrow(error);
    if (isScenarioLabError(error)) {
      return {
        ok: false,
        code: error.code,
        title: "Unable to create scenario run",
        message: error.message,
      };
    }
    throw error;
  }
}

export async function openScenarioLabPublicIntakeAction(
  formData: FormData,
): Promise<SecurityActionResult> {
  try {
    const access = await requireLabAccess();
    const runId = String(formData.get("runId") ?? "").trim();
    if (!runId) {
      return {
        ok: false,
        code: "INVALID_INPUT",
        title: "Missing run",
        message: "Choose a scenario run first.",
      };
    }

    const opened = await markScenarioLabPublicIntakeOpened(access.request, db, runId);
    revalidatePath(`/scenario-lab/runs/${runId}`);
    revalidatePath("/scenario-lab");

    return {
      ok: true,
      title: "Opening public intake",
      message: "Continue in the real customer inquiry form.",
      redirectTo: opened.publicIntakePath,
    };
  } catch (error) {
    unstable_rethrow(error);
    if (isScenarioLabError(error)) {
      return {
        ok: false,
        code: error.code,
        title: "Unable to open public intake",
        message: error.message,
      };
    }
    throw error;
  }
}
