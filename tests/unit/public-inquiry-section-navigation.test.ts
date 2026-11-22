/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  findFirstInvalidControl,
  isSectionComplete,
  navigateToFirstInvalidField,
  nextSectionKey,
  prefersReducedMotion,
  PUBLIC_INQUIRE_SECTION_ATTR,
  requiredControlsInSection,
  scrollBehaviorForMotion,
  shouldAdvanceFromSection,
} from "@/lib/inquiries/public-inquiry-section-navigation";

function mountForm(html: string): HTMLFormElement {
  document.body.innerHTML = html;
  const form = document.querySelector("form");
  if (!form) {
    throw new Error("form missing");
  }
  return form;
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("public inquiry section navigation helpers", () => {
  it("orders next section keys and stops at occasion", () => {
    expect(nextSectionKey("contact")).toBe("event");
    expect(nextSectionKey("event")).toBe("attractions");
    expect(nextSectionKey("attractions")).toBe("preferences");
    expect(nextSectionKey("preferences")).toBe("occasion");
    expect(nextSectionKey("occasion")).toBeNull();
  });

  it("does not treat incomplete required fields as complete", () => {
    const form = mountForm(`
      <form>
        <section ${PUBLIC_INQUIRE_SECTION_ATTR}="contact">
          <input name="firstName" required value="" />
          <input name="email" type="email" required value="ada@example.com" />
        </section>
      </form>
    `);
    const section = form.querySelector("section")!;
    expect(isSectionComplete(section)).toBe(false);
  });

  it("marks a section complete only when all required constraints pass", () => {
    const form = mountForm(`
      <form>
        <section ${PUBLIC_INQUIRE_SECTION_ATTR}="contact">
          <input name="firstName" required value="Ada" />
          <input name="lastName" required value="Lovelace" />
          <input name="email" type="email" required value="ada@example.com" />
        </section>
      </form>
    `);
    const section = form.querySelector("section")!;
    expect(isSectionComplete(section)).toBe(true);
  });

  it("rejects nonempty but invalid email", () => {
    const form = mountForm(`
      <form>
        <section ${PUBLIC_INQUIRE_SECTION_ATTR}="contact">
          <input name="firstName" required value="Ada" />
          <input name="email" type="email" required value="not-an-email" />
        </section>
      </form>
    `);
    expect(isSectionComplete(form.querySelector("section")!)).toBe(false);
  });

  it("ignores hidden conditional fields that are not in the DOM", () => {
    const form = mountForm(`
      <form>
        <section ${PUBLIC_INQUIRE_SECTION_ATTR}="preferences">
          <input type="radio" name="hasBudget" value="no" required checked />
          <input type="radio" name="hasBudget" value="yes" required />
        </section>
      </form>
    `);
    expect(isSectionComplete(form.querySelector("section")!)).toBe(true);
  });

  it("requires conditional budget when present and required", () => {
    const form = mountForm(`
      <form>
        <section ${PUBLIC_INQUIRE_SECTION_ATTR}="preferences">
          <input type="radio" name="hasBudget" value="yes" required checked />
          <input type="radio" name="hasBudget" value="no" required />
          <input name="budget" type="number" required min="0.01" step="0.01" value="" />
        </section>
      </form>
    `);
    expect(isSectionComplete(form.querySelector("section")!)).toBe(false);
    const budget = form.querySelector<HTMLInputElement>('input[name="budget"]')!;
    budget.value = "500";
    expect(isSectionComplete(form.querySelector("section")!)).toBe(true);
  });

  it("treats required radio groups as one control", () => {
    const form = mountForm(`
      <form>
        <section ${PUBLIC_INQUIRE_SECTION_ATTR}="attractions">
          <input type="radio" name="attractions[bowling]" value="yes" required />
          <input type="radio" name="attractions[bowling]" value="no" required />
        </section>
      </form>
    `);
    const section = form.querySelector("section")!;
    expect(requiredControlsInSection(section)).toHaveLength(1);
    expect(isSectionComplete(section)).toBe(false);
    (form.querySelector('input[value="yes"]') as HTMLInputElement).checked = true;
    expect(isSectionComplete(section)).toBe(true);
  });

  it("advances only once after a touched incomplete→complete transition", () => {
    const touched = new Set<string>();
    const advanced = new Set<string>();
    expect(
      shouldAdvanceFromSection({
        sectionKey: "contact",
        touched,
        advanced,
        complete: true,
      }),
    ).toBe(false);

    touched.add("contact");
    expect(
      shouldAdvanceFromSection({
        sectionKey: "contact",
        touched,
        advanced,
        complete: true,
      }),
    ).toBe(true);

    advanced.add("contact");
    expect(
      shouldAdvanceFromSection({
        sectionKey: "contact",
        touched,
        advanced,
        complete: true,
      }),
    ).toBe(false);
  });

  it("never advances beyond the final section", () => {
    expect(
      shouldAdvanceFromSection({
        sectionKey: "occasion",
        touched: new Set(["occasion"]),
        advanced: new Set(),
        complete: true,
      }),
    ).toBe(false);
  });

  it("finds the first invalid control in document order", () => {
    const form = mountForm(`
      <form>
        <section ${PUBLIC_INQUIRE_SECTION_ATTR}="contact">
          <input name="firstName" required value="" />
          <input name="email" type="email" required value="" />
        </section>
        <section ${PUBLIC_INQUIRE_SECTION_ATTR}="event">
          <input name="time" type="time" required value="" />
        </section>
      </form>
    `);
    const first = findFirstInvalidControl(form);
    expect(first?.getAttribute("name")).toBe("firstName");
  });

  it("scrolls the section and focuses the first invalid field once", () => {
    const form = mountForm(`
      <form>
        <section ${PUBLIC_INQUIRE_SECTION_ATTR}="contact">
          <input name="firstName" required value="" />
        </section>
      </form>
    `);
    const section = form.querySelector("section")!;
    const input = form.querySelector<HTMLInputElement>('input[name="firstName"]')!;
    const scrollSpy = vi.spyOn(section, "scrollIntoView").mockImplementation(() => undefined);
    const focusSpy = vi.spyOn(input, "focus").mockImplementation(() => undefined);

    const handled = navigateToFirstInvalidField(form, { reduceMotion: true });
    expect(handled).toBe(input);
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("uses instant scroll when reduced motion is preferred", () => {
    expect(scrollBehaviorForMotion(true)).toBe("auto");
    expect(scrollBehaviorForMotion(false)).toBe("smooth");
    expect(prefersReducedMotion({ matches: true })).toBe(true);
    expect(prefersReducedMotion({ matches: false })).toBe(false);
  });
});
