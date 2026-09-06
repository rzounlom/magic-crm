import { notFound } from "next/navigation";

import { PublicConversationPanel } from "@/components/layout/public-conversation-panel";
import { db } from "@/lib/db";
import { customerFacingOrganizationName } from "@/lib/inquiries/organization-display-name";
import { isInquiryError } from "@/server/errors";
import { getPublicConversationByToken } from "@/server/services/inquiry-service";

async function loadPublicConversation(token: string) {
  try {
    return await getPublicConversationByToken(db, token);
  } catch (error) {
    if (isInquiryError(error)) {
      return null;
    }
    throw error;
  }
}

export default async function PublicConversationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const conversation = await loadPublicConversation(token);
  if (!conversation) {
    notFound();
  }

  return (
    <PublicConversationPanel
      organizationName={customerFacingOrganizationName(conversation.organizationName)}
      messages={conversation.messages}
      token={token}
      aiHandlingEnabled={conversation.inquiry.aiHandlingEnabled}
    />
  );
}
