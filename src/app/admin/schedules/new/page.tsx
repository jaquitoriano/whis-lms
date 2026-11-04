import { requireRole } from "@/lib/auth";
import { NewClassForm, type Pair } from "@/components/class/NewClassForm";
import { PageHeader } from "@/components/ui";
import { isDateStr, todayStr } from "@/lib/time";

export const metadata = { title: "Schedule a class" };

export default async function AdminNewClassPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { supabase, profile } = await requireRole("admin");
  const { date } = await searchParams;
  const [{ data: links }, { data: courses }] = await Promise.all([
    supabase
      .from("teacher_students")
      .select(
        "teacher_id, student_id, teacher:profiles!teacher_students_teacher_id_fkey(full_name), student:profiles!teacher_students_student_id_fkey(full_name, status)",
      )
      .eq("active", true),
    supabase.from("courses").select("id, name").eq("active", true).order("sort_order"),
  ]);
  type L = { teacher_id: string; student_id: string; teacher: { full_name: string }; student: { full_name: string; status: string } };
  const pairs: Pair[] = ((links ?? []) as unknown as L[])
    .filter((l) => l.student.status !== "inactive")
    .map((l) => ({ teacher_id: l.teacher_id, student_id: l.student_id, label: `${l.student.full_name} with ${l.teacher.full_name}`, course_id: null, duration: 50 }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <>
      <PageHeader title="Schedule a class" description="Times are entered in your time zone and shown to each person in theirs." />
      <NewClassForm pairs={pairs} date={isDateStr(date) ? date : todayStr(profile.timezone)} tz={profile.timezone} courses={courses ?? []} />
    </>
  );
}
