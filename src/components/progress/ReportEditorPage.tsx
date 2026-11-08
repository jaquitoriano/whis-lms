import Link from "@/components/Link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ReportEditor } from "./ReportEditor";
import { SkillChange } from "./SkillChange";
import { PageHeader } from "@/components/ui";
import { deleteReport, saveReport } from "@/lib/progress-actions";
import { formatPeriod, formatPlainDate, type ProgressReport } from "@/lib/progress-shared";
import type { Profile } from "@/lib/types";

// Write or correct a progress report. Teachers edit only their own; admins can correct any.
export async function ReportEditorPage({ supabase, viewer, id }: { supabase: SupabaseClient; viewer: Profile; id: string }) {
  const { data: report } = await supabase
    .from("progress_reports")
    .select("*, student:profiles!progress_reports_student_id_fkey(id, full_name)")
    .eq("id", id)
    .maybeSingle<ProgressReport & { student: { id: string; full_name: string } | null }>();
  if (!report || (viewer.role !== "admin" && report.author_id !== viewer.id)) notFound();
  const { data: previous } = await supabase
    .from("progress_reports")
    .select("*")
    .eq("student_id", report.student_id)
    .eq("status", "published")
    .lt("period_end", report.period_end)
    .neq("id", report.id)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle<ProgressReport>();
  const back = `/${viewer.role}/progress/${report.student_id}`;
  const published = report.status === "published";

  return (
    <>
      <Link href={back} className="mb-4 inline-block text-sm text-muted hover:text-foreground">
        ← {report.student?.full_name ?? "Student"}&apos;s progress
      </Link>
      <PageHeader
        title={`${published ? "Correct" : "Write"} progress report`}
        description={`${report.student?.full_name ?? "Student"} · ${formatPeriod(report.period_start, report.period_end)}${published ? ` · published ${formatPlainDate(report.published_at?.slice(0, 10))}` : " · draft"}`}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <ReportEditor report={report} action={saveReport.bind(null, report.id)} />
        <aside className="space-y-4">
          {previous ? (
            <section className="card">
              <h2 className="mb-1 font-semibold">Previous report</h2>
              <p className="mb-3 text-sm text-muted">{formatPeriod(previous.period_start, previous.period_end)}</p>
              <SkillChange report={previous} />
              {previous.next_goals && (
                <div className="mt-4 text-sm">
                  <p className="font-medium">Goals set last time</p>
                  <p className="mt-1 whitespace-pre-line text-muted">{previous.next_goals}</p>
                </div>
              )}
            </section>
          ) : (
            <section className="card text-sm text-muted">This is the student&apos;s first progress report.</section>
          )}
          <section className="card text-sm">
            <h2 className="mb-1 font-semibold">Tip</h2>
            <p className="text-muted">
              Look at the lesson history and homework since the last report before you choose levels. The{" "}
              <Link href={`/${viewer.role === "admin" ? "admin/users" : "teacher/students"}/${report.student_id}${viewer.role === "admin" ? "?role=student" : ""}`} className="text-brand-700 hover:underline">
                student page
              </Link>{" "}
              has both.
            </p>
          </section>
          {(!published || viewer.role === "admin") && (
            <form action={deleteReport.bind(null, report.id)}>
              <button type="submit" className="btn-danger w-full">
                {published ? "Remove this report" : "Delete draft"}
              </button>
            </form>
          )}
        </aside>
      </div>
    </>
  );
}
