import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { classPath, statusLabel, statusStyle, type SessionRow } from "@/lib/sessions";
import { formatDateTime } from "@/lib/time";
import type { Role } from "@/lib/types";

export type LessonListRow = SessionRow & { lesson: { feedback_overall: string; today_topics: string; shared_with_student: boolean } | null };

// A table of past classes with a short summary of each lesson record (LES-04, STU lesson history).
export function LessonList({ rows, viewer, tz, empty }: { rows: LessonListRow[]; viewer: Role; tz: string; empty: string }) {
  if (rows.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">{viewer === "student" ? "Teacher" : viewer === "teacher" ? "Student" : "Teacher → Student"}</th>
            <th className="px-4 py-3 font-medium">Topics</th>
            <th className="px-4 py-3 font-medium">Status</th>
            {viewer !== "student" && <th className="px-4 py-3 font-medium">Notes</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const hasNotes = !!(r.lesson && (r.lesson.feedback_overall || r.lesson.today_topics));
            return (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3">
                  <Link href={classPath(viewer, r.id)} className="font-medium hover:text-brand-700">
                    {formatDateTime(r.starts_at, tz, { year: "numeric" })}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {viewer === "student" ? r.teacher?.full_name : viewer === "teacher" ? r.student?.full_name : `${r.teacher?.full_name} → ${r.student?.full_name}`}
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-muted">{r.lesson?.today_topics || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`badge border ${statusStyle[r.status]}`}>{statusLabel[r.status]}</span>
                </td>
                {viewer !== "student" && (
                  <td className="px-4 py-3">
                    {r.status === "completed" && !hasNotes ? (
                      <span className="text-amber-700">Missing</span>
                    ) : hasNotes ? (
                      r.lesson!.shared_with_student ? "Shared" : "Draft"
                    ) : (
                      "—"
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
