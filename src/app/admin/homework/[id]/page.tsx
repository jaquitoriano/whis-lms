import { requireRole } from "@/lib/auth";
import { HomeworkDetail } from "@/components/homework/HomeworkDetail";

export const metadata = { title: "Homework" };

export default async function AdminHomeworkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, profile } = await requireRole("admin");
  const { id } = await params;
  return <HomeworkDetail supabase={supabase} viewer={profile} id={id} />;
}
