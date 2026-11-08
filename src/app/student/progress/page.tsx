import { requireRole } from "@/lib/auth";
import { ProgressView } from "@/components/progress/ProgressView";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "My Progress" };

export default async function StudentProgressPage() {
  const { supabase, profile } = await requireRole("student");
  const { data: sprof } = await supabase.from("student_profiles").select("course:courses(type)").eq("user_id", profile.id).maybeSingle();
  const course = (sprof?.course ?? null) as unknown as { type: string } | null;
  return (
    <>
      <PageHeader title="My progress" description="Your teacher's progress reports and your test results." />
      <ProgressView supabase={supabase} viewer={profile} student={profile} isIelts={course?.type === "ielts"} />
    </>
  );
}
