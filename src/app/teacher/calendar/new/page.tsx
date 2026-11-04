import { requireRole } from "@/lib/auth";
import { getMyStudents } from "@/lib/teacher-data";
import { NewClassForm } from "@/components/class/NewClassForm";
import { PageHeader } from "@/components/ui";
import { isDateStr, todayStr } from "@/lib/time";

export const metadata = { title: "Schedule a class" };

export default async function TeacherNewClassPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { supabase, profile } = await requireRole("teacher");
  const { date } = await searchParams;
  const [students, { data: courses }, { data: setting }] = await Promise.all([
    getMyStudents(supabase, profile.id),
    supabase.from("courses").select("id, name").eq("active", true).order("sort_order"),
    supabase.rpc("setting_bool", { p_key: "teachers_can_schedule" }),
  ]);

  if (setting === false) {
    return (
      <>
        <PageHeader title="Schedule a class" />
        <p className="card text-sm text-muted">Classes are scheduled by the school office. Please contact them to add a class.</p>
      </>
    );
  }

  const pairs = students
    .filter((s) => s.student.status !== "inactive")
    .map((s) => ({
      teacher_id: profile.id,
      student_id: s.student.id,
      label: `${s.student.full_name}${s.student.student_profile?.course?.name ? ` · ${s.student.student_profile.course.name}` : ""}`,
      course_id: s.student.student_profile?.course_id ?? null,
      duration: 50,
    }));

  return (
    <>
      <PageHeader title="Schedule a class" description="The class appears on your and your student's calendars straight away." />
      <NewClassForm pairs={pairs} date={isDateStr(date) ? date : todayStr(profile.timezone)} tz={profile.timezone} courses={courses ?? []} />
    </>
  );
}
