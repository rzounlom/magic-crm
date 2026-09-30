type SecurityStatusPanelProps = {
  title: string;
  body: string;
};

export function SecurityStatusPanel({ title, body }: SecurityStatusPanelProps) {
  return (
    <section className="empty-state max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </section>
  );
}
