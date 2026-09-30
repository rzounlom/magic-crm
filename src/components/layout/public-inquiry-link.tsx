type PublicInquiryLinkProps = {
  href: string;
};

export function PublicInquiryLink({ href }: PublicInquiryLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="shrink-0 cursor-pointer rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground shadow-sm hover:border-primary/40"
    >
      Public Inquiry
    </a>
  );
}
