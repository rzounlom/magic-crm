/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AuthWorkspaceTransition } from "@/components/auth/auth-workspace-transition";

afterEach(() => {
  cleanup();
});

describe("AuthWorkspaceTransition", () => {
  it("renders branded status messaging for the checking phase", () => {
    render(<AuthWorkspaceTransition phase="checking" />);
    expect(screen.getByRole("status").hasAttribute("data-auth-transition")).toBe(true);
    expect(screen.getByText("Getting your workspace ready")).toBeTruthy();
    expect(
      screen.getByText("Securely checking your session and loading your organization."),
    ).toBeTruthy();
    expect(screen.getByText("MagicCRM")).toBeTruthy();
  });

  it("surfaces recovery guidance without inventing an error", () => {
    render(<AuthWorkspaceTransition phase="redirecting" showRecovery />);
    expect(screen.getByRole("link", { name: /return to sign in/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /marketing home/i })).toBeTruthy();
    expect(screen.getByText(/taking longer than usual/i)).toBeTruthy();
  });
});
