import { requireRole } from "@/lib/auth";
import { ClassDetail } from "@/components/class/ClassDetail";

export const metadata = { title: "Class" };

export default async function TeacherClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, profile } = await requireRole("teacher");
  const { id } = await params;
  return <ClassDetail supabase={supabase} viewer={profile} id={id} />;
}
