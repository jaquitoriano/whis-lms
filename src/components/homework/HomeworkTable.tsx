import Link from "@/components/Link";
import { EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/time";
import { isOverdue, statusLabel, statusStyle, type Homework } from "@/lib/homework-shared";
import type { Role } from "@/lib/types";

export function HomeworkStatusBadges({ h, now = Date.now() }: { h: Pick<Homework, "status" | "due_at" | "is_required">; now?: number }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <span className={`badge ${statusStyle[h.status]}`}>{statusLabel[h.status]}</span>
      {isOverdue(h, now) && h.is_required && <span className="badge bg-red-50 text-red-700">Overdue</span>}
      {!h.is_required && <span className="badge bg-slate-100 text-slate-600">Optional</span>}
    </span>
  );
}

export function HomeworkTable({
  rows,
  viewer,
  tz,
  empty,
  waitingSince,
}: {
  rows: Homework[];
  viewer: Role;
  tz: string;
  empty: string;
  waitingSince?: Map<string, string>;
}) {
  if (!rows.length) return <EmptyState>{empty}</EmptyState>;
  const now = Date.now();
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Homework</th>
            {viewer !== "student" && <th className="hidden px-4 py-3 font-medium sm:table-cell">Student</th>}
            {viewer !== "teacher" && <th className="hidden px-4 py-3 font-medium sm:table-cell">Teacher</th>}
            <th className="hidden px-4 py-3 font-medium sm:table-cell">Due</th>
            <th className="hidden px-4 py-3 font-medium sm:table-cell">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((h) => {
            const since = waitingSince?.get(h.id);
            const waitingLong = since && (h.status === "submitted" || h.status === "under_review") && now - Date.parse(since) > 48 * 3600000;
            return (
              <tr key={h.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/${viewer}/homework/${h.id}`} className="font-medium hover:text-brand-700">
                    {h.title}
                  </Link>
                  {/* On phones the other columns are hidden and their details sit under the title. */}
                  <div className="mt-1 space-y-1 text-xs text-muted sm:hidden">
                    {viewer !== "student" && <p>{h.student?.full_name}</p>}
                    {viewer !== "teacher" && <p>{h.teacher?.full_name}</p>}
                    <p>Due {formatDateTime(h.due_at, tz)}</p>
                    <p>
                      <HomeworkStatusBadges h={h} now={now} />
                      {waitingLong && <span className="badge ml-1 bg-amber-50 text-amber-700">Waiting &gt; 48 h</span>}
                    </p>
                  </div>
                </td>
                {viewer !== "student" && <td className="hidden px-4 py-3 sm:table-cell">{h.student?.full_name}</td>}
                {viewer !== "teacher" && <td className="hidden px-4 py-3 sm:table-cell">{h.teacher?.full_name}</td>}
                <td className="hidden whitespace-nowrap px-4 py-3 text-muted sm:table-cell">{formatDateTime(h.due_at, tz)}</td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  <HomeworkStatusBadges h={h} now={now} />
                  {waitingLong && <span className="badge ml-1 bg-amber-50 text-amber-700">Waiting &gt; 48 h</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
