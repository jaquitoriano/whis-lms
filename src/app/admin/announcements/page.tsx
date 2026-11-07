import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { FORMAT_HINT, RichText } from "@/components/RichText";
import { SubmitButton } from "@/components/SubmitButton";
import { EmptyState, PageHeader } from "@/components/ui";
import { createAnnouncement, deleteAnnouncement } from "@/lib/admin-comms-actions";
import { formatDateTime, todayStr, tzLabel } from "@/lib/time";

export const metadata = { title: "Announcements" };

const audienceLabel: Record<string, string> = {
  everyone: "Everyone",
  all_teachers: "All teachers",
  all_students: "All students",
  specific: "Specific people",
};

export default async function AdminAnnouncementsPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { supabase, profile } = await requireRole("admin");
  const { sent } = await searchParams;
  const [{ data: rows }, { data: people }] = await Promise.all([
    supabase.from("announcements").select("*, recipients:announcement_recipients(user_id)").order("publish_at", { ascending: false }).limit(100),
    supabase.from("profiles").select("id, full_name, role").in("role", ["teacher", "student"]).neq("status", "inactive").order("role").order("full_name"),
  ]);
  const now = Date.now();

  return (
    <>
      <PageHeader title="Announcements" description="Sent to the chosen people's notification centre and by email." />
      {sent && <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Announcement saved.</p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section className="card h-fit">
          <h2 className="mb-4 font-semibold">New announcement</h2>
          <ActionForm action={createAnnouncement} submitLabel="Send" pendingText="Sending…">
            <div>
              <label className="label" htmlFor="title">Title</label>
              <input className="input" id="title" name="title" maxLength={200} required placeholder="e.g. Website maintenance on Saturday" />
            </div>
            <div>
              <label className="label" htmlFor="body">Message</label>
              <textarea className="input min-h-32" id="body" name="body" maxLength={10000} />
              <p className="mt-1 text-xs text-muted">{FORMAT_HINT}</p>
            </div>
            <div>
              <label className="label" htmlFor="audience">Send to</label>
              <select className="input" id="audience" name="audience" defaultValue="everyone">
                <option value="everyone">Everyone (teachers and students)</option>
                <option value="all_teachers">All teachers</option>
                <option value="all_students">All students</option>
                <option value="specific">Specific people (choose below)</option>
              </select>
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-brand-700">Choose specific people</summary>
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                {(people ?? []).map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="recipients" value={p.id} /> {p.full_name} <span className="text-xs capitalize text-muted">{p.role}</span>
                  </label>
                ))}
              </div>
            </details>
            <fieldset className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="schedule" /> Publish later
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <input className="input" type="date" name="publish_date" defaultValue={todayStr(profile.timezone)} aria-label="Publish date" />
                <input className="input" type="time" name="publish_time" defaultValue="08:00" aria-label={`Publish time (${tzLabel(profile.timezone)})`} />
              </div>
            </fieldset>
            <div>
              <label className="label" htmlFor="expires_date">Hide after (optional)</label>
              <input className="input" type="date" id="expires_date" name="expires_date" />
            </div>
          </ActionForm>
        </section>

        <section>
          <h2 className="mb-3 font-semibold">Sent and scheduled</h2>
          {(rows ?? []).length === 0 ? (
            <EmptyState>No announcements yet.</EmptyState>
          ) : (
            <div className="space-y-3">
              {(rows ?? []).map((a) => {
                const scheduled = Date.parse(a.publish_at) > now;
                const expired = a.expires_at && Date.parse(a.expires_at) < now;
                return (
                  <article key={a.id} className="card">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-medium">{a.title}</h3>
                        <p className="text-xs text-muted">
                          {audienceLabel[a.audience]}
                          {a.audience === "specific" && ` (${a.recipients?.length ?? 0})`} · {scheduled ? "scheduled for " : ""}
                          {formatDateTime(a.publish_at, profile.timezone)}
                          {scheduled && <span className="badge ml-2 bg-amber-50 text-amber-700">Scheduled</span>}
                          {expired && <span className="badge ml-2 bg-slate-100 text-slate-600">Hidden</span>}
                        </p>
                      </div>
                      <form action={deleteAnnouncement.bind(null, a.id)}>
                        <SubmitButton className="btn-danger px-2 py-1 text-xs" pendingText="…">
                          Delete
                        </SubmitButton>
                      </form>
                    </div>
                    <RichText text={a.body} className="mt-2" />
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
