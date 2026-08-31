"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      closeButton
      richColors
      duration={5000}
      theme="light"
      toastOptions={{
        classNames: {
          toast: "border border-border bg-background text-foreground shadow-md",
          title: "font-medium text-foreground",
          description: "text-foreground/70",
          closeButton: "border-border bg-background text-foreground",
          success: "border-success/30",
          error: "border-destructive/30",
          warning: "border-warning/30",
          info: "border-primary/30",
        },
      }}
    />
  );
}
