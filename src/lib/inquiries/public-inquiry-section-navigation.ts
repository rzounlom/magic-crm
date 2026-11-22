/**
 * Behavior-only helpers for public WP inquiry section progression and
 * validation-error navigation. Does not change validation rules or layout.
 */

export const PUBLIC_INQUIRE_SECTION_KEYS = [
  "contact",
  "event",
  "attractions",
  "preferences",
  "occasion",
] as const;

export type PublicInquireSectionKey = (typeof PUBLIC_INQUIRE_SECTION_KEYS)[number];

export const PUBLIC_INQUIRE_SECTION_ATTR = "data-inquire-section";

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isFormControl(node: EventTarget | null): node is FormControl {
  return (
    node instanceof HTMLInputElement ||
    node instanceof HTMLSelectElement ||
    node instanceof HTMLTextAreaElement
  );
}

function isVisibleControl(control: FormControl): boolean {
  if (control.disabled) {
    return false;
  }
  if (control instanceof HTMLInputElement && control.type === "hidden") {
    return false;
  }
  if (control.hidden) {
    return false;
  }
  // Conditional fields are unmounted when inactive. Explicit CSS hide still counts.
  if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
    try {
      const style = window.getComputedStyle(control);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }
    } catch {
      // jsdom may lack full style computation; treat as visible.
    }
  }
  return true;
}

/** Required controls that participate in native constraint validation for a section. */
export function requiredControlsInSection(section: HTMLElement): FormControl[] {
  const controls = Array.from(
    section.querySelectorAll<FormControl>("input, select, textarea"),
  ).filter((control) => {
    if (!isVisibleControl(control)) {
      return false;
    }
    if (control instanceof HTMLInputElement && control.type === "radio") {
      // One representative per required radio group.
      if (!control.required) {
        return false;
      }
      const group = Array.from(
        section.querySelectorAll<HTMLInputElement>(
          `input[type="radio"][name="${CSS.escape(control.name)}"]`,
        ),
      ).filter(isVisibleControl);
      return group[0] === control;
    }
    return Boolean(control.required);
  });
  return controls;
}

export function isSectionComplete(section: HTMLElement): boolean {
  const controls = requiredControlsInSection(section);
  if (controls.length === 0) {
    return false;
  }
  return controls.every((control) => {
    if (control instanceof HTMLInputElement && control.type === "radio") {
      const group = Array.from(
        section.querySelectorAll<HTMLInputElement>(
          `input[type="radio"][name="${CSS.escape(control.name)}"]`,
        ),
      ).filter(isVisibleControl);
      return group.some((radio) => radio.checked) && group.every((radio) => radio.validity.valid);
    }
    return control.checkValidity();
  });
}

export function findSectionElement(
  node: Element | null,
  root: ParentNode | null = null,
): HTMLElement | null {
  let current: Element | null = node;
  while (current) {
    if (current instanceof HTMLElement && current.hasAttribute(PUBLIC_INQUIRE_SECTION_ATTR)) {
      return current;
    }
    if (root && current === root) {
      break;
    }
    current = current.parentElement;
  }
  return null;
}

export function findSectionByKey(
  form: HTMLElement,
  key: PublicInquireSectionKey,
): HTMLElement | null {
  return form.querySelector<HTMLElement>(`[${PUBLIC_INQUIRE_SECTION_ATTR}="${key}"]`);
}

export function nextSectionKey(
  key: PublicInquireSectionKey,
): PublicInquireSectionKey | null {
  const index = PUBLIC_INQUIRE_SECTION_KEYS.indexOf(key);
  if (index < 0 || index >= PUBLIC_INQUIRE_SECTION_KEYS.length - 1) {
    return null;
  }
  return PUBLIC_INQUIRE_SECTION_KEYS[index + 1] ?? null;
}

export function sectionKeyOf(section: HTMLElement): PublicInquireSectionKey | null {
  const value = section.getAttribute(PUBLIC_INQUIRE_SECTION_ATTR);
  if (!value) {
    return null;
  }
  return (PUBLIC_INQUIRE_SECTION_KEYS as readonly string[]).includes(value)
    ? (value as PublicInquireSectionKey)
    : null;
}

export function findFirstInvalidControl(form: HTMLFormElement): FormControl | null {
  const candidates = Array.from(
    form.querySelectorAll<FormControl>("input, select, textarea"),
  ).filter((control) => {
    if (!isVisibleControl(control)) {
      return false;
    }
    if (control instanceof HTMLInputElement && control.type === "radio") {
      if (!control.required && !control.validity.valueMissing) {
        // Still include if the control itself reports invalid for other reasons.
      }
    }
    return !control.validity.valid;
  });

  // Prefer document order; for radio groups keep the first invalid in the group.
  const seenRadioGroups = new Set<string>();
  for (const control of candidates) {
    if (control instanceof HTMLInputElement && control.type === "radio") {
      if (seenRadioGroups.has(control.name)) {
        continue;
      }
      seenRadioGroups.add(control.name);
    }
    return control;
  }
  return null;
}

export function prefersReducedMotion(
  media: Pick<MediaQueryList, "matches"> | null = null,
): boolean {
  const resolved =
    media ??
    (typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null);
  return Boolean(resolved?.matches);
}

export function scrollBehaviorForMotion(reduceMotion: boolean): ScrollBehavior {
  return reduceMotion ? "auto" : "smooth";
}

export function scrollElementIntoView(
  element: HTMLElement,
  options: { reduceMotion?: boolean } = {},
): void {
  const reduceMotion = options.reduceMotion ?? prefersReducedMotion();
  element.scrollIntoView({
    behavior: scrollBehaviorForMotion(reduceMotion),
    block: "start",
    inline: "nearest",
  });
}

export function focusControlWithoutExtraScroll(control: FormControl): void {
  try {
    control.focus({ preventScroll: true });
  } catch {
    control.focus();
  }
}

/**
 * Navigate to the first invalid required field: scroll its section, then focus.
 * Returns the control when handled.
 */
export function navigateToFirstInvalidField(
  form: HTMLFormElement,
  options: { reduceMotion?: boolean } = {},
): FormControl | null {
  const control = findFirstInvalidControl(form);
  if (!control) {
    return null;
  }
  const section = findSectionElement(control, form) ?? control;
  scrollElementIntoView(section, options);
  focusControlWithoutExtraScroll(control);
  return control;
}

export function shouldAdvanceFromSection(input: {
  sectionKey: PublicInquireSectionKey;
  touched: ReadonlySet<string>;
  advanced: ReadonlySet<string>;
  complete: boolean;
}): boolean {
  if (!input.complete) {
    return false;
  }
  if (!input.touched.has(input.sectionKey)) {
    return false;
  }
  if (input.advanced.has(input.sectionKey)) {
    return false;
  }
  return nextSectionKey(input.sectionKey) != null;
}

export function isDiscreteCompletionControl(control: FormControl): boolean {
  if (control instanceof HTMLSelectElement) {
    return true;
  }
  if (control instanceof HTMLTextAreaElement) {
    return false;
  }
  if (control instanceof HTMLInputElement) {
    const type = control.type;
    return (
      type === "radio" ||
      type === "checkbox" ||
      type === "date" ||
      type === "time" ||
      type === "number" ||
      type === "range"
    );
  }
  return false;
}

export function isTextLikeControl(control: FormControl): boolean {
  if (control instanceof HTMLTextAreaElement) {
    return true;
  }
  if (!(control instanceof HTMLInputElement)) {
    return false;
  }
  const type = control.type;
  return (
    type === "text" ||
    type === "email" ||
    type === "tel" ||
    type === "url" ||
    type === "search" ||
    type === "password" ||
    type === ""
  );
}

export { isFormControl };
