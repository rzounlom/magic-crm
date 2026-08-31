type SecurityStatusPanelProps = {
  title: string;
  body: string;
};

export function SecurityStatusPanel({ title, body }: SecurityStatusPanelProps) {
  return (
    <section className="max-w-xl">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-4 text-sm text-foreground/70">{body}</p>
    </section>
  );
}
