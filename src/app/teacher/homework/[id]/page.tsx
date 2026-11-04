import { requireRole } from "@/lib/auth";
import { HomeworkDetail } from "@/components/homework/HomeworkDetail";

export const metadata = { title: "Homework" };

export default async function TeacherHomeworkDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; reviewed?: string }>;
}) {
  const { supabase, profile } = await requireRole("teacher");
  const { id } = await params;
  const { created, reviewed } = await searchParams;
  return <HomeworkDetail supabase={supabase} viewer={profile} id={id} flash={created ? "created" : reviewed === "completed" || reviewed === "needs_revision" ? reviewed : undefined} />;
}
