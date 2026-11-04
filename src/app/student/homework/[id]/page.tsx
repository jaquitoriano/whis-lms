import { requireRole } from "@/lib/auth";
import { HomeworkDetail } from "@/components/homework/HomeworkDetail";

export const metadata = { title: "Homework" };

export default async function StudentHomeworkDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { supabase, profile } = await requireRole("student");
  const { id } = await params;
  const { submitted } = await searchParams;
  return <HomeworkDetail supabase={supabase} viewer={profile} id={id} flash={submitted ? "submitted" : undefined} />;
}
