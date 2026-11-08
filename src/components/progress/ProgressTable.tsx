import Link from "@/components/Link";
import { Avatar, EmptyState } from "@/components/ui";
import { cefrLabel, fmtBand, formatPlainDate, type IeltsResult, type ProgressReport } from "@/lib/progress-shared";

export type ProgressRow = {
  student: { id: string; full_name: string; avatar_url: string | null };
  course?: string | null;
  teacher?: string | null;
  report?: ProgressReport;
  draft?: ProgressReport;
  ielts?: IeltsResult;
  dueSince?: string;
};

// One row per student: last report, draft, latest IELTS band and whether a report is due (DASH-02).
export function ProgressTable({ rows, base, showTeacher = false }: { rows: ProgressRow[]; base: string; showTeacher?: boolean }) {
  if (rows.length === 0) return <EmptyState>No students yet.</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Student</th>
            {showTeacher && <th className="hidden px-4 py-3 font-medium md:table-cell">Teacher</th>}
            <th className="hidden px-4 py-3 font-medium sm:table-cell">Last report</th>
            <th className="hidden px-4 py-3 font-medium sm:table-cell">Level</th>
            <th className="hidden px-4 py-3 font-medium sm:table-cell">IELTS</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.student.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link href={`${base}/${r.student.id}`} className="flex items-center gap-3 font-medium hover:text-brand-700">
                  <Avatar profile={r.student} size={32} />
                  <span>
                    {r.student.full_name}
                    {r.course && <span className="block text-xs font-normal text-muted">{r.course}</span>}
                    <span className="block text-xs font-normal text-muted sm:hidden">
                      {r.report ? `${cefrLabel(r.report.overall)} · ${formatPlainDate(r.report.period_end)}` : "No report yet"}
                    </span>
                  </span>
                </Link>
              </td>
              {showTeacher && <td className="hidden px-4 py-3 md:table-cell">{r.teacher ?? "—"}</td>}
              <td className="hidden px-4 py-3 sm:table-cell">{r.report ? formatPlainDate(r.report.period_end) : <span className="text-muted">None yet</span>}</td>
              <td className="hidden px-4 py-3 font-medium sm:table-cell">{r.report ? cefrLabel(r.report.overall) : "—"}</td>
              <td className="hidden px-4 py-3 tabular-nums sm:table-cell">{r.ielts ? fmtBand(r.ielts.overall) : "—"}</td>
              <td className="px-4 py-3">
                <span className="inline-flex flex-wrap gap-1">
                  {r.dueSince && (
                    <span className="badge bg-amber-50 text-amber-700" title={`Classes since ${formatPlainDate(r.dueSince)} aren't covered by a report`}>
                      Report due
                    </span>
                  )}
                  {r.draft && <span className="badge bg-slate-100 text-slate-600">Draft</span>}
                  {!r.dueSince && !r.draft && <span className="badge bg-green-50 text-green-700">Up to date</span>}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
