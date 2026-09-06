export type SecurityActionResult =
  | { ok: true; title?: string; message?: string; redirectTo?: string }
  | {
      ok: false;
      code?: string;
      title?: string;
      message: string;
      fieldErrors?: Record<string, string>;
    };
