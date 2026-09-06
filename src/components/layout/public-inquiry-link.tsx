type PublicInquiryLinkProps = {
  href: string;
};

export function PublicInquiryLink({ href }: PublicInquiryLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="shrink-0 cursor-pointer rounded-md border border-border px-2.5 py-1 text-sm font-medium text-foreground hover:bg-muted/60"
    >
      Public Inquiry
    </a>
  );
}
