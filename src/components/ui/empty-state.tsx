export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="empty-state" role="status">
      <p className="font-semibold text-foreground">{title}</p>
      {detail ? <p className="mt-1 text-sm text-muted-foreground">{detail}</p> : null}
    </div>
  );
}
