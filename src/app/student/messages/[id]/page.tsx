import { requireRole } from "@/lib/auth";
import { ThreadView } from "@/components/messages/ThreadView";

export const metadata = { title: "Conversation" };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, profile } = await requireRole("student");
  const { id } = await params;
  return <ThreadView supabase={supabase} viewer={profile} id={id} />;
}
