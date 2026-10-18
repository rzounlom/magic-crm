import { describe, expect, it } from "vitest";

import {
  resolveNextDistDir,
  SCENARIO_LAB_LOCAL_DIST_DIR,
} from "@/lib/build/next-dist-dir";

describe("resolveNextDistDir", () => {
  it("uses the isolated lab directory for local scenario_lab_test", () => {
    expect(
      resolveNextDistDir({
        MAGICCRM_DEPLOYMENT_KIND: "scenario_lab_test",
      }),
    ).toBe(SCENARIO_LAB_LOCAL_DIST_DIR);
  });

  it("keeps the default Next.js output on Vercel even when Lab kind is set", () => {
    expect(
      resolveNextDistDir({
        VERCEL: "1",
        MAGICCRM_DEPLOYMENT_KIND: "scenario_lab_test",
        SCENARIO_LAB_ENABLED: "true",
      }),
    ).toBeUndefined();

    expect(
      resolveNextDistDir({
        VERCEL: "true",
        MAGICCRM_DEPLOYMENT_KIND: "scenario_lab_test",
      }),
    ).toBeUndefined();
  });

  it("keeps the default output for ordinary local development", () => {
    expect(resolveNextDistDir({})).toBeUndefined();
    expect(
      resolveNextDistDir({
        MAGICCRM_DEPLOYMENT_KIND: "local_development",
      }),
    ).toBeUndefined();
    expect(
      resolveNextDistDir({
        MAGICCRM_DEPLOYMENT_KIND: "customer_production",
      }),
    ).toBeUndefined();
  });

  it("does not treat NEXT_PUBLIC flags as a Vercel or Lab signal", () => {
    expect(
      resolveNextDistDir({
        NEXT_PUBLIC_VERCEL: "1",
        NEXT_PUBLIC_MAGICCRM_DEPLOYMENT_KIND: "scenario_lab_test",
      }),
    ).toBeUndefined();
  });
});
