import type { SupabaseClient } from "@supabase/supabase-js";
import { EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { markAllRead, openNotification } from "@/lib/portal-actions";
import { formatDateTime } from "@/lib/time";
import type { Profile } from "@/lib/types";

type Row = { id: string; type: string; title: string; body: string; created_at: string; read_at: string | null };

// Notification centre (NOT-20): newest first; opening one marks it read and follows its link.
export async function NotificationsPage({ supabase, viewer }: { supabase: SupabaseClient; viewer: Profile }) {
  const { data } = await supabase.from("notifications").select("id, type, title, body, created_at, read_at").order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as Row[];
  const unread = rows.filter((r) => !r.read_at).length;
  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : "You're all caught up."}
        action={
          unread > 0 ? (
            <form action={markAllRead}>
              <SubmitButton className="btn-secondary" pendingText="…">
                Mark all as read
              </SubmitButton>
            </form>
          ) : undefined
        }
      />
      {rows.length === 0 ? (
        <EmptyState>No notifications yet.</EmptyState>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {rows.map((n) => (
            <li key={n.id}>
              <form action={openNotification.bind(null, n.id)}>
                <button type="submit" className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 ${n.read_at ? "" : "bg-brand-50/40"}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-brand-600"}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${n.read_at ? "" : "font-semibold"}`}>{n.title}</span>
                    {n.body && <span className="block text-sm text-muted">{n.body}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{formatDateTime(n.created_at, viewer.timezone)}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
