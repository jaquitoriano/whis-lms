import Link from "next/link";
import { classPath, counterpart, statusLabel, statusStyle, type SessionRow } from "@/lib/sessions";
import { formatDateTime } from "@/lib/time";
import type { Role } from "@/lib/types";

export function SessionList({ sessions, viewer, tz, empty }: { sessions: SessionRow[]; viewer: Role; tz: string; empty: string }) {
  if (sessions.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border text-sm">
      {sessions.map((s) => (
        <li key={s.id}>
          <Link href={classPath(viewer, s.id)} className="flex items-center justify-between gap-3 py-2 hover:text-brand-700">
            <span>
              <span className="font-medium">{formatDateTime(s.starts_at, tz)}</span>
              <span className="block text-muted">
                {counterpart(s, viewer)} · {s.course?.name ?? "Class"}
              </span>
            </span>
            {s.status !== "scheduled" && <span className={`badge border ${statusStyle[s.status]}`}>{statusLabel[s.status]}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
