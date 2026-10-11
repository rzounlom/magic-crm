import fs from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const slug = process.env.PLAYWRIGHT_PUBLIC_ORG_SLUG;
const SCREENSHOT_DIR = path.join(process.cwd(), "docs/design/ux9-screenshots");

const VIEWPORTS = [
  { name: "320", width: 320, height: 720 },
  { name: "375", width: 375, height: 812 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
] as const;

async function assertNoHorizontalOverflow(page: Page) {
  const overflowX = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return Math.max(doc.scrollWidth, body.scrollWidth) - window.innerWidth;
  });
  expect(overflowX, "page should not scroll horizontally").toBeLessThanOrEqual(1);
}

async function scrollPlannerTop(page: Page) {
  await page.evaluate(() => {
    const scroller = document.querySelector("[data-planner-scroll]");
    if (scroller instanceof HTMLElement) {
      scroller.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  });
}

async function fillThroughWhen(page: Page) {
  await page.getByRole("button", { name: /Birthday Party/ }).click();
  await page.getByRole("textbox", { name: "Guest count" }).fill("16");
  await page.getByRole("button", { name: "Mix of Kids & Adults" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "The fun stuff", exact: true })).toBeVisible();

  const foodYes = page.getByRole("button", { name: "Food: Yes" });
  if ((await foodYes.getAttribute("aria-pressed")) !== "true") {
    await foodYes.click();
  }
  const space = page.getByRole("button", { name: "Private space: No preference" });
  if ((await space.getAttribute("aria-pressed")) !== "true") {
    await space.click();
  }
  const flexible = page.getByRole("button", { name: "Flexible / show me options" });
  if ((await flexible.getAttribute("aria-pressed")) !== "true") {
    await flexible.click();
  }
  const length = page.getByRole("button", { name: "2 hours", exact: true });
  if ((await length.getAttribute("aria-pressed")) !== "true") {
    await length.click();
  }
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "When", exact: true })).toBeVisible();
  await page.getByLabel("Event date").fill("2026-10-20");
  await page.getByLabel("Preferred start time").selectOption("18:00");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your details", exact: true })).toBeVisible();
}

test.describe("public intake UX8/UX9 journey", () => {
  test.skip(!slug, "Set PLAYWRIGHT_PUBLIC_ORG_SLUG for a non-production inquire host");

  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  for (const viewport of VIEWPORTS) {
    test(`event selection renders at ${viewport.name}px without overflow`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`/inquire/${slug}`);
      await expect(page.getByRole("heading", { name: "Your event", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Start over" })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await scrollPlannerTop(page);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `event-${viewport.name}.png`),
        fullPage: true,
      });
    });
  }

  test("captures fun/when/details/draft/validation at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/inquire/${slug}`);

    await page.getByRole("button", { name: /Birthday Party/ }).click();
    await page.getByRole("textbox", { name: "Guest count" }).fill("16");
    await page.getByRole("button", { name: "Mix of Kids & Adults" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "The fun stuff", exact: true })).toBeVisible();
    await scrollPlannerTop(page);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "fun-390.png"), fullPage: true });

    await page.reload();
    await expect(page.getByText(/restored your event preferences/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Birthday Party/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("textbox", { name: "Guest count" })).toHaveValue("16");
    await scrollPlannerTop(page);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "draft-restored-390.png"), fullPage: true });

    await page.getByRole("button", { name: "Continue" }).click();
    const foodYes = page.getByRole("button", { name: "Food: Yes" });
    if (await foodYes.isVisible()) {
      if ((await foodYes.getAttribute("aria-pressed")) !== "true") {
        await foodYes.click();
      }
      const space = page.getByRole("button", { name: "Private space: No preference" });
      if ((await space.getAttribute("aria-pressed")) !== "true") {
        await space.click();
      }
      const flexible = page.getByRole("button", { name: "Flexible / show me options" });
      if ((await flexible.getAttribute("aria-pressed")) !== "true") {
        await flexible.click();
      }
      const length = page.getByRole("button", { name: "2 hours", exact: true });
      if ((await length.getAttribute("aria-pressed")) !== "true") {
        await length.click();
      }
    }
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "When", exact: true })).toBeVisible();
    await page.getByLabel("Event date").fill("2026-10-20");
    await page.getByLabel("Preferred start time").selectOption("23:30");
    await scrollPlannerTop(page);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "when-390.png"), fullPage: true });
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Your details", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "First name" })).toBeVisible();
    await expect(page.getByText(/does not reserve activities or collect payment/i)).toBeVisible();
    await scrollPlannerTop(page);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "details-390.png"), fullPage: true });

    await page.getByRole("button", { name: "Build my event options" }).click();
    await expect(page.getByText("Enter a first name.").first()).toBeVisible();
    await scrollPlannerTop(page);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "validation-390.png"), fullPage: true });

    await page.getByRole("button", { name: "Edit Guests" }).click();
    await expect(page.getByRole("heading", { name: "Your event", exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Guest count" }).fill("18");

    await page.getByRole("button", { name: "Start over" }).click();
    await page.getByRole("dialog", { name: "Start over?" }).getByRole("button", { name: "Start over" }).click();
    await expect(page.getByRole("button", { name: /Birthday Party/ })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: "Build my event options" })).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
  });

  test("details shows labeled contact fields before review", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/inquire/${slug}`);
    await fillThroughWhen(page);
    await scrollPlannerTop(page);
    const firstName = page.getByRole("textbox", { name: "First name" });
    const notes = page.getByRole("textbox", { name: "Notes (optional)" });
    await expect(firstName).toBeVisible();
    await expect(notes).toBeVisible();
    const firstBox = await firstName.boundingBox();
    const notesBox = await notes.boundingBox();
    expect(firstBox && notesBox && firstBox.y < notesBox.y).toBeTruthy();
    await expect(page.getByRole("heading", { name: "Review your answers" })).toBeVisible();
  });
});
