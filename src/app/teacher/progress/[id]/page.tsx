import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { ProgressView } from "@/components/progress/ProgressView";
import { Avatar, PageHeader } from "@/components/ui";
import type { Profile } from "@/lib/types";

export const metadata = { title: "Student progress" };

export default async function TeacherStudentProgressPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; published?: string; error?: string }>;
}) {
  const { supabase, profile } = await requireRole("teacher");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  // RLS returns nothing unless this student is currently assigned to the teacher.
  const [{ data: student }, { data: sprof }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).eq("role", "student").maybeSingle<Profile>(),
    supabase.from("student_profiles").select("class_level, course:courses(name, type)").eq("user_id", id).maybeSingle(),
  ]);
  if (!student) notFound();
  const course = (sprof?.course ?? null) as unknown as { name: string; type: string } | null;

  return (
    <>
      <Link href="/teacher/progress" className="mb-4 inline-block text-sm text-muted hover:text-foreground">
        ← Student progress
      </Link>
      <div className="mb-6 flex items-center gap-4">
        <Avatar profile={student} size={56} />
        <div>
          <PageHeader title={student.full_name} />
          <p className="-mt-5 text-sm text-muted">
            {course?.name ?? "No course"}
            {sprof?.class_level ? ` · class level ${sprof.class_level}` : ""} ·{" "}
            <Link href={`/teacher/students/${id}`} className="text-brand-700 hover:underline">
              Student page
            </Link>
          </p>
        </div>
      </div>
      <ProgressView
        supabase={supabase}
        viewer={profile}
        student={student}
        isIelts={course?.type === "ielts"}
        editResult={sp.edit}
        notice={{ ok: sp.published ? "Report published. The student has been notified." : undefined, error: sp.error }}
      />
    </>
  );
}
