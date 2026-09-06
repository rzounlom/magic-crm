import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

import { createOrganizationDirectory } from "@/lib/auth/create-organization-directory";
import type { OrganizationDirectory } from "@/lib/auth/organization-directory";

export { createOrganizationDirectory } from "@/lib/auth/create-organization-directory";

export async function createClerkOrganizationDirectory(): Promise<OrganizationDirectory> {
  const client = await clerkClient();
  return createOrganizationDirectory(client.organizations);
}
