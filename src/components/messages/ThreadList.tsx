import Link from "@/components/Link";
import { Avatar, EmptyState } from "@/components/ui";
import { formatDateTime, toDateStr, todayStr } from "@/lib/time";
import { isUnread, otherParty, type Thread } from "@/lib/messages";
import type { Profile } from "@/lib/types";

export function threadTitle(t: Thread, tz: string) {
  if (t.kind === "class") return t.session ? `Class on ${formatDateTime(t.session.starts_at, tz)}` : "About a class";
  return "General";
}

function when(iso: string, tz: string) {
  return toDateStr(new Date(iso), tz) === todayStr(tz) ? formatDateTime(iso, tz, { weekday: undefined, day: undefined, month: undefined }) : formatDateTime(iso, tz, { hour: undefined, minute: undefined });
}

// Conversation list (MSG-01). Admins see both names; teachers and students see the other person.
export function ThreadList({ threads, viewer, empty }: { threads: Thread[]; viewer: Profile; empty: React.ReactNode }) {
  if (threads.length === 0) return <EmptyState>{empty}</EmptyState>;
  const tz = viewer.timezone;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {threads.map((t) => {
        const unread = isUnread(t, viewer.id);
        const { person, fallback } = otherParty(t, viewer);
        const name = viewer.role === "admin" ? `${t.teacher?.full_name ?? "Teacher"} and ${t.student?.full_name ?? "student"}` : (person?.full_name ?? fallback);
        return (
          <li key={t.id}>
            <Link href={`/${viewer.role}/messages/${t.id}`} className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 ${unread ? "bg-brand-50/40" : ""}`}>
              <Avatar profile={viewer.role === "admin" ? (t.student ?? { full_name: "?", avatar_url: null }) : (person ?? { full_name: fallback, avatar_url: null })} size={40} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate ${unread ? "font-semibold" : "font-medium"}`}>{name}</span>
                  {t.last_message_at && <span className="shrink-0 text-xs text-muted">{when(t.last_message_at, tz)}</span>}
                </span>
                <span className="block text-xs text-muted">{threadTitle(t, tz)}</span>
                <span className={`mt-0.5 block truncate text-sm ${unread ? "text-foreground" : "text-muted"}`}>
                  {t.last_sender_id === viewer.id && "You: "}
                  {t.last_preview || "No messages yet"}
                </span>
              </span>
              {unread && (
                <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600" aria-label="Unread" role="img" />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
