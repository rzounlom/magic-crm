type SecurityStatusPanelProps = {
  title: string;
  body: string;
  /**
   * Optional staff guidance when denial is expected role behavior
   * (for example inventory/team admin). Never exposes elevated controls.
   */
  guidance?: string;
};

export function SecurityStatusPanel({ title, body, guidance }: SecurityStatusPanelProps) {
  return (
    <section className="empty-state max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      {guidance ? (
        <p className="mt-3 text-sm text-foreground/80" data-permission-guidance>
          {guidance}
        </p>
      ) : null}
    </section>
  );
}
