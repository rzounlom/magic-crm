import { formatMoneyFromCents } from "@/lib/event-planner/money";
import {
  BUDGET_EXPLANATION_CODES,
  type BudgetExplanationCode,
} from "@/types/catalog";

/** Calm customer copy. Budget is advisory and is not styled as an error. */
export function budgetFitCustomerText(input: {
  code: BudgetExplanationCode | null | undefined;
  differenceCents: number | null | undefined;
  currency?: string;
  /** True when explicit attraction selections were kept and the total is still above the range. */
  preservedSelections?: boolean;
}): string | null {
  if (!input.code || input.code === BUDGET_EXPLANATION_CODES.NO_BUDGET || input.code === BUDGET_EXPLANATION_CODES.UNSPECIFIED) {
    return null;
  }
  if (input.code === BUDGET_EXPLANATION_CODES.WITHIN_BUDGET) {
    return "Within your preferred budget";
  }
  if (input.code === BUDGET_EXPLANATION_CODES.ABOVE_BUDGET && input.preservedSelections) {
    const amount =
      input.differenceCents != null && input.differenceCents > 0
        ? `${formatMoneyFromCents(input.differenceCents, input.currency)} `
        : "";
    return `Your selected activities put this option ${amount}above your preferred budget range.`;
  }
  if (
    input.code === BUDGET_EXPLANATION_CODES.ABOVE_BUDGET &&
    input.differenceCents != null &&
    input.differenceCents > 0
  ) {
    return `${formatMoneyFromCents(input.differenceCents, input.currency)} above your preferred range`;
  }
  if (
    input.code === BUDGET_EXPLANATION_CODES.BELOW_BUDGET &&
    input.differenceCents != null &&
    input.differenceCents < 0
  ) {
    return `${formatMoneyFromCents(Math.abs(input.differenceCents), input.currency)} below your preferred range`;
  }
  return null;
}
