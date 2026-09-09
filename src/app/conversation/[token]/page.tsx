import { redirect } from "next/navigation";

export default async function PublicConversationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/plan/${token}`);
}
