import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { ProgressView } from "@/components/progress/ProgressView";
import { PageHeader } from "@/components/ui";
import type { Profile } from "@/lib/types";

export const metadata = { title: "Student progress" };

export default async function AdminStudentProgressPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; published?: string; error?: string }>;
}) {
  const { supabase, profile } = await requireRole("admin");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [{ data: student }, { data: sprof }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).eq("role", "student").maybeSingle<Profile>(),
    supabase.from("student_profiles").select("course:courses(name, type)").eq("user_id", id).maybeSingle(),
  ]);
  if (!student) notFound();
  const course = (sprof?.course ?? null) as unknown as { name: string; type: string } | null;
  return (
    <>
      <Link href="/admin/progress" className="mb-4 inline-block text-sm text-muted hover:text-foreground">
        ← Student progress
      </Link>
      <PageHeader
        title={student.full_name}
        description={course?.name ?? "No course"}
        action={
          <Link href={`/admin/users/${id}?role=student`} className="btn-secondary">
            Student details
          </Link>
        }
      />
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
