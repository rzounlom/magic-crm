import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";

const ALLOWED_ELEMENTS = ["p", "strong", "em", "ul", "ol", "li", "br"];

type AssistantMarkdownProps = {
  content: string;
};

export function AssistantMarkdown({ content }: AssistantMarkdownProps) {
  return (
    <div className="mt-2 text-foreground [&_p]:m-0 [&_p+p]:mt-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_li]:my-0 [&_strong]:font-semibold [&_em]:italic">
      <ReactMarkdown
        remarkPlugins={[remarkBreaks]}
        skipHtml
        unwrapDisallowed
        allowedElements={ALLOWED_ELEMENTS}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
