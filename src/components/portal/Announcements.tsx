import Link from "@/components/Link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RichText } from "@/components/RichText";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/time";
import type { Profile, Role } from "@/lib/types";

type Row = { id: string; title: string; body: string; publish_at: string };

async function load(supabase: SupabaseClient, limit: number) {
  // RLS returns only published, unexpired announcements meant for this person.
  const { data } = await supabase.from("announcements").select("id, title, body, publish_at").order("publish_at", { ascending: false }).limit(limit);
  return (data ?? []) as Row[];
}

// Dashboard panel (DASH-01/02 "important announcements").
export async function AnnouncementsPanel({ supabase, role, tz }: { supabase: SupabaseClient; role: Role; tz: string }) {
  const rows = await load(supabase, 3);
  return (
    <section className="card">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Announcements</h2>
        <Link href={`/${role}/announcements`} className="text-sm text-brand-700 hover:underline">
          All
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No announcements.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((a) => (
            <li key={a.id}>
              <Link href={`/${role}/announcements#a-${a.id}`} className="block hover:text-brand-700">
                <span className="block text-sm font-medium">{a.title}</span>
                <span className="text-xs text-muted">{formatDateTime(a.publish_at, tz)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export async function AnnouncementsList({ supabase, viewer }: { supabase: SupabaseClient; viewer: Profile }) {
  const rows = await load(supabase, 50);
  return (
    <>
      <PageHeader title="Announcements" />
      {rows.length === 0 ? (
        <EmptyState>No announcements.</EmptyState>
      ) : (
        <div className="space-y-4">
          {rows.map((a) => (
            <article key={a.id} id={`a-${a.id}`} className="card scroll-mt-20">
              <h2 className="font-semibold">{a.title}</h2>
              <p className="mb-3 text-xs text-muted">{formatDateTime(a.publish_at, viewer.timezone, { year: "numeric" })}</p>
              <RichText text={a.body} />
            </article>
          ))}
        </div>
      )}
    </>
  );
}
