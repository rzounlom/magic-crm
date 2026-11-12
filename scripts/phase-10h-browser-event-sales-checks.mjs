/**
 * Phase 10H — Event Sales-only browser checks on synthetic tenant.
 * Requires playwright/.auth/event-sales.json from headed Clerk TEST bootstrap.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const STORAGE = process.env.PLAYWRIGHT_EVENT_SALES_STORAGE_STATE ?? "playwright/.auth/event-sales.json";
const SYNTHETIC_LOC = "wm0e8lezc95bs0oowjs5rts5";
const FIXTURE_INQUIRY = path.join("playwright", ".fixtures", "phase-10g-wp-inquiry.json");
const OUT = path.join("playwright", ".fixtures", "phase-10h-event-sales-checks.json");

if (!fs.existsSync(STORAGE)) {
  console.error(
    JSON.stringify({
      ok: false,
      error: "Missing Event Sales storage state. Run headed bootstrap first.",
      expected: STORAGE,
    }),
  );
  process.exit(1);
}

const inquiryFixture = fs.existsSync(FIXTURE_INQUIRY)
  ? JSON.parse(fs.readFileSync(FIXTURE_INQUIRY, "utf8"))
  : null;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: STORAGE });
const page = await context.newPage();
const steps = [];

async function step(name, fn) {
  try {
    const detail = await fn();
    steps.push({ name, result: "PASS", detail: detail ?? null });
  } catch (error) {
    steps.push({
      name,
      result: "FAIL",
      detail: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

const GATE = path.join("playwright", ".fixtures", "phase-10h-event-sales-identity-gate.json");
const gate = fs.existsSync(GATE) ? JSON.parse(fs.readFileSync(GATE, "utf8")) : null;

try {
  await step("verify_event_sales_identity_not_administrator", async () => {
    await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
    if (page.url().includes("sign-in")) {
      throw new Error("Redirected to sign-in — Event Sales session expired or invalid.");
    }
    const identity = await page.evaluate(async () => {
      const clerk = window.Clerk;
      if (!clerk?.user) {
        await clerk?.load?.();
      }
      const user = clerk?.user;
      return {
        clerkUserId: user?.id ?? null,
        email:
          user?.primaryEmailAddress?.emailAddress ??
          user?.emailAddresses?.[0]?.emailAddress ??
          null,
      };
    });
    if (!gate?.eventSales?.clerkUserId) {
      throw new Error("Missing identity gate — cannot prove Event Sales-only session.");
    }
    if (identity.clerkUserId !== gate.eventSales.clerkUserId) {
      const redacted = identity.email
        ? `${identity.email.slice(0, 2)}***@${identity.email.split("@")[1]}`
        : "(unknown)";
      throw new Error(
        `Session is not Event Sales-only. Detected ${redacted} / ${String(identity.clerkUserId).slice(0, 10)}…`,
      );
    }
    if (
      gate.rejectAdministrator?.clerkUserId &&
      identity.clerkUserId === gate.rejectAdministrator.clerkUserId
    ) {
      throw new Error("Administrator session detected — refusing Event Sales checks.");
    }
    return {
      clerkUserIdPrefix: String(identity.clerkUserId).slice(0, 10),
      emailRedacted: identity.email
        ? `${identity.email.slice(0, 2)}***@${identity.email.split("@")[1]}`
        : null,
    };
  });

  await step("isolation_active_org_is_synthetic", async () => {
    await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
    if (page.url().includes("sign-in")) {
      throw new Error("Redirected to sign-in — Event Sales session expired or invalid.");
    }
    const chip = (await page.locator("[data-employee-context]").first().innerText())
      .replace(/\s+/g, " ")
      .trim();
    if (/generations-crm-test/i.test(chip)) {
      throw new Error(`Active org is Generations (${chip}); refusing.`);
    }
    if (!/magiccrm-test-center-b/i.test(chip)) {
      throw new Error(`Active org is not synthetic: ${chip}`);
    }
    return chip;
  });

  await step("event_sales_cannot_access_operating_hours_admin", async () => {
    const res = await page.goto(`${BASE}/app/admin/operating-hours`, {
      waitUntil: "networkidle",
    });
    const status = res?.status() ?? 0;
    const body = await page.locator("body").innerText();
    const denied =
      status === 403 ||
      status === 401 ||
      /not authorized|permission|access denied|forbidden|don't have permission|cannot access/i.test(
        body,
      ) ||
      page.url().includes("sign-in") ||
      !(await page.getByRole("heading", { name: "Operating hours" }).count());
    const hasVerify = (await page.getByRole("button", { name: /Verify/i }).count()) > 0;
    const hasDraftSave =
      (await page.getByRole("button", { name: /Save draft|Create draft|Verify hours/i }).count()) >
      0;
    if (!denied && (hasVerify || hasDraftSave)) {
      throw new Error("Event Sales appears able to manage operating hours admin UI.");
    }
    if (!denied && status >= 200 && status < 400) {
      // Soft deny: page may render empty shell without manage controls
      const headingVisible = (await page.getByRole("heading", { name: "Operating hours" }).count()) >
        0;
      if (headingVisible && hasDraftSave) {
        throw new Error("Operating hours admin controls visible to Event Sales.");
      }
    }
    return {
      status,
      denied: Boolean(denied),
      hasVerify,
      hasDraftSave,
      url: page.url().split("?")[0],
    };
  });

  await step("event_sales_cannot_open_synthetic_location_hours_editor", async () => {
    const res = await page.goto(`${BASE}/app/admin/operating-hours/${SYNTHETIC_LOC}`, {
      waitUntil: "networkidle",
    });
    const status = res?.status() ?? 0;
    const body = await page.locator("body").innerText();
    const canEdit =
      (await page.getByRole("button", { name: /Save draft|Verify|Add exception/i }).count()) > 0;
    if (canEdit) {
      throw new Error("Event Sales can edit location operating hours — expected denial.");
    }
    const denied =
      status >= 400 ||
      /not authorized|permission|access denied|forbidden|not found/i.test(body) ||
      !canEdit;
    return { status, canEdit, denied };
  });

  if (!inquiryFixture || inquiryFixture.organizationSlug !== "magiccrm-test-center-b") {
    throw new Error("Missing synthetic WP inquiry fixture from Phase 10G.");
  }

  await step("open_synthetic_inquiry_as_event_sales", async () => {
    const res = await page.goto(`${BASE}${inquiryFixture.inquiryPath}`, {
      waitUntil: "networkidle",
    });
    if ((res?.status() ?? 500) >= 400) throw new Error(`HTTP ${res?.status()}`);
    await page.locator("[data-wp-staff-quote-draft], text=Staff quote").first().waitFor({
      timeout: 20000,
    }).catch(async () => {
      // May need to create draft
      const create = page.getByRole("button", {
        name: /Create staff quote draft|Refresh draft from private calculation/i,
      });
      if (await create.count()) {
        await create.first().click();
        await page.locator("[data-wp-staff-quote-draft]").waitFor({ timeout: 20000 });
      } else {
        throw new Error("Staff quote draft panel not available to Event Sales.");
      }
    });
    if (!(await page.locator("[data-wp-staff-quote-draft]").count())) {
      const create = page.getByRole("button", {
        name: /Create staff quote draft|Refresh draft from private calculation/i,
      });
      if (await create.count()) {
        await create.first().click();
        await page.locator("[data-wp-staff-quote-draft]").waitFor({ timeout: 20000 });
      }
    }
    return { path: inquiryFixture.inquiryPath };
  });

  await step("event_sales_unit_price_fields_readonly", async () => {
    await page.goto(`${BASE}${inquiryFixture.inquiryPath}`, { waitUntil: "networkidle" });
    await page.locator("[data-wp-staff-quote-draft]").waitFor({ timeout: 20000 });
    const unit = page.locator("[data-wp-staff-quote-draft] input[name='lineUnitCents_0']");
    await unit.waitFor({ timeout: 10000 });
    const readonly = await unit.getAttribute("readonly");
    if (readonly === null) {
      throw new Error("Unit price input is editable for Event Sales — expected readonly.");
    }
    const before = await unit.inputValue();
    // Attempt fill anyway — Playwright can set value on readonly in some cases; verify server reject below
    await unit.fill(String(Number(before || "1500") + 99), { force: true }).catch(() => undefined);
    return { readonly: true, before };
  });

  await step("event_sales_server_rejects_price_override", async () => {
    await page.goto(`${BASE}${inquiryFixture.inquiryPath}`, { waitUntil: "networkidle" });
    await page.locator("[data-wp-staff-quote-draft]").waitFor({ timeout: 20000 });
    const unit = page.locator("input[name='lineUnitCents_0']");
    const before = await unit.inputValue();
    // Remove readonly via DOM to simulate malicious client, then submit
    await page.evaluate(() => {
      const el = document.querySelector("input[name='lineUnitCents_0']");
      if (el) {
        el.removeAttribute("readonly");
        el.value = String(Number(el.value || "1500") + 123);
      }
    });
    await page.locator("input[name='editReason']").fill("Phase 10H Event Sales override probe — synthetic only.");
    const responsePromise = page
      .waitForResponse(
        (r) => r.url().includes("/app/inquiries/") && r.request().method() === "POST",
        { timeout: 20000 },
      )
      .catch(() => null);
    await page.getByRole("button", { name: /Save staff edits/i }).click();
    const resp = await responsePromise;
    await page.waitForTimeout(2000);
    const notice = (
      await page.locator("[data-security-action-notice], [role='status']").allTextContents()
    ).join(" ");
    await page.goto(`${BASE}${inquiryFixture.inquiryPath}`, { waitUntil: "networkidle" });
    const after = await page.locator("input[name='lineUnitCents_0']").inputValue();
    if (after !== before) {
      throw new Error(
        `Price override persisted for Event Sales. before=${before} after=${after}. notice=${notice}`,
      );
    }
    const deniedSignal =
      /unable|permission|not authorized|price_override|override/i.test(notice) ||
      after === before;
    return {
      before,
      after,
      postStatus: resp?.status() ?? null,
      noticeSnippet: notice.slice(0, 200),
      deniedSignal,
    };
  });

  await step("event_sales_can_approve_internally_delivery_gated", async () => {
    await page.goto(`${BASE}${inquiryFixture.inquiryPath}`, { waitUntil: "networkidle" });
    await page.locator("[data-wp-staff-quote-draft]").waitFor({ timeout: 20000 });
    const policy = await page
      .locator("[data-wp-quote-delivery-policy]")
      .getAttribute("data-wp-quote-delivery-policy");
    const approve = page.getByRole("button", {
      name: /Approve quote \(delivery gated\)|Approve and send quote/i,
    });
    if (!(await approve.count())) {
      // Draft may need recreate if prior admin approval left state odd — try refresh draft
      const refresh = page.getByRole("button", {
        name: /Create staff quote draft|Refresh draft from private calculation/i,
      });
      if (await refresh.count()) {
        await refresh.first().click();
        await page.waitForTimeout(2000);
      }
    }
    if (!(await approve.count())) {
      throw new Error(`Approve control missing for Event Sales (policy=${policy}).`);
    }
    const label = (await approve.first().innerText()).trim();
    if (/Approve and send quote/i.test(label) && !/delivery gated/i.test(label)) {
      throw new Error(`Unexpected live send label for Event Sales: ${label}`);
    }
    await approve.first().click({ timeout: 15000 });
    await page.waitForTimeout(2500);
    await page.goto(`${BASE}${inquiryFixture.inquiryPath}`, { waitUntil: "networkidle" });
    const body = await page.locator("body").innerText();
    const deliveryStillGated =
      /delivery gated|delivery remains blocked|customer delivery stays disabled/i.test(body) ||
      (await page
        .locator(
          '[data-wp-quote-delivery-policy="approved_plugin_baseline_pending_operational_verification"]',
        )
        .count()) > 0;
    if (!deliveryStillGated) {
      throw new Error("Customer delivery does not appear gated after Event Sales approve.");
    }
    return { policy, label, deliveryStillGated: true };
  });

  await step("customer_quote_delivery_remains_blocked", async () => {
    const policy = await page
      .locator("[data-wp-quote-delivery-policy]")
      .getAttribute("data-wp-quote-delivery-policy");
    if (policy === "tenant_live_verified") {
      throw new Error("Delivery policy unexpectedly tenant_live_verified.");
    }
    const liveSend = page.getByRole("button", { name: /^Approve and send quote$/i });
    if (await liveSend.count()) {
      throw new Error("Live send control visible after Event Sales approve.");
    }
    return { policy, liveSendVisible: false };
  });

  const result = {
    ok: true,
    storageStatePath: STORAGE,
    inquiryFixture,
    steps,
    note: "Event Sales-only synthetic checks. No Generations Production writes. No customer email.",
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const result = {
    ok: false,
    storageStatePath: STORAGE,
    inquiryFixture,
    steps,
    error: error instanceof Error ? error.message : String(error),
    finalUrl: page.url(),
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
