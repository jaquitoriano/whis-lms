import { requireRole } from "@/lib/auth";
import { getMyStudents } from "@/lib/teacher-data";
import { getSession as getClass } from "@/lib/sessions";
import { HomeworkForm } from "@/components/homework/HomeworkForm";
import { PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Assign homework" };

export default async function NewHomeworkPage({ searchParams }: { searchParams: Promise<{ session?: string; student?: string }> }) {
  const { supabase, profile } = await requireRole("teacher");
  const sp = await searchParams;

  // From a class page: the student and class are fixed (HW-S01). Otherwise pick a student (HW-S06).
  const cls = sp.session ? await getClass(supabase, sp.session) : null;
  const fromClass = cls && cls.teacher_id === profile.id ? cls : null;
  const students = (await getMyStudents(supabase, profile.id))
    .filter((s) => s.student.status !== "inactive")
    .map((s) => ({ id: s.student.id, label: s.student.full_name }));
  const { data: materials } = fromClass
    ? await supabase.from("materials").select("id, title, kind").eq("session_id", fromClass.id)
    : { data: [] };

  // Default deadline: the next class with this student, else one week from now.
  const studentId = fromClass?.student_id ?? sp.student;
  let defaultDue = new Date(Date.now() + 7 * 86400000);
  if (studentId) {
    const { data: next } = await supabase
      .from("class_sessions")
      .select("starts_at")
      .eq("teacher_id", profile.id)
      .eq("student_id", studentId)
      .eq("status", "scheduled")
      .gt("starts_at", fromClass?.ends_at ?? new Date().toISOString())
      .order("starts_at")
      .limit(1)
      .maybeSingle();
    if (next) defaultDue = new Date(Date.parse(next.starts_at) - 60 * 60000);
  }

  return (
    <>
      <PageHeader
        title="Assign homework"
        description={fromClass ? `After the class on ${formatDateTime(fromClass.starts_at, profile.timezone)}` : "Homework not tied to a specific class"}
      />
      <div className="card max-w-2xl">
        {students.length === 0 ? (
          <p className="text-sm text-muted">No students are assigned to you yet.</p>
        ) : (
          <HomeworkForm
            tz={profile.timezone}
            students={fromClass ? students.filter((s) => s.id === fromClass.student_id) : students}
            sessionId={fromClass?.id ?? null}
            materials={(materials ?? []) as { id: string; title: string; kind: "file" | "link" }[]}
            defaultStudent={studentId}
            defaultDue={defaultDue}
          />
        )}
      </div>
    </>
  );
}
