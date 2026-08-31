export function onSafeSubmitAttempt(pending: boolean): "block" | "run" {
  return pending ? "block" : "run";
}

export function onDestructiveSubmitAttempt(pending: boolean): "block" | "open-dialog" {
  return pending ? "block" : "open-dialog";
}

export function onConfirmDialogChoice(
  pending: boolean,
  choice: "cancel" | "confirm",
): "abort" | "block" | "run" {
  if (choice === "cancel") {
    return "abort";
  }
  return pending ? "block" : "run";
}
