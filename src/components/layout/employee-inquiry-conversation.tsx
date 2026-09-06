import { AssistantMarkdown } from "@/components/layout/assistant-markdown";
import { MESSAGE_SENDER_TYPES } from "@/types/inquiry";

export type EmployeeInquiryConversationMessage = {
  id: string;
  senderType: string;
  content: string;
};

type EmployeeInquiryConversationProps = {
  messages: EmployeeInquiryConversationMessage[];
};

export function EmployeeInquiryConversation({ messages }: EmployeeInquiryConversationProps) {
  return (
    <ol className="mt-4 space-y-3">
      {messages.map((message) => (
        <li key={message.id} className="rounded-md border border-border px-4 py-3 text-sm">
          <p className="text-xs font-medium tracking-wide text-foreground/60 uppercase">
            {senderLabel(message.senderType)}
          </p>
          {message.senderType === MESSAGE_SENDER_TYPES.AI ? (
            <AssistantMarkdown content={message.content} />
          ) : (
            <p className="mt-2 whitespace-pre-wrap">{message.content}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

function senderLabel(senderType: string): string {
  if (senderType === MESSAGE_SENDER_TYPES.CUSTOMER) {
    return "Customer";
  }
  if (senderType === MESSAGE_SENDER_TYPES.EMPLOYEE) {
    return "Employee";
  }
  if (senderType === MESSAGE_SENDER_TYPES.SYSTEM) {
    return "System";
  }
  return "Event Assistant";
}
