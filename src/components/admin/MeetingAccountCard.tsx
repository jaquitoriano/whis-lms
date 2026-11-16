import type { SupabaseClient } from "@supabase/supabase-js";
import { ActionForm } from "@/components/ActionForm";
import { queueUpcomingMeetings, saveMeetingAccount } from "@/lib/meeting-actions";
import { service, type Provider } from "@/lib/meetings/sync";

// Admin, teacher page: which Zoom or Google Meet account hosts this teacher's classes (Phase 7b).
export async function MeetingAccountCard({ supabase, teacherId }: { supabase: SupabaseClient; teacherId: string }) {
  const [{ data: acc }, { count: waiting }, { count: failing }] = await Promise.all([
    supabase.from("teacher_meeting_accounts").select("provider, account_email, active").eq("teacher_id", teacherId).maybeSingle(),
    supabase
      .from("class_meetings")
      .select("session_id, class_sessions!inner(teacher_id)", { count: "exact", head: true })
      .eq("class_sessions.teacher_id", teacherId)
      .not("action", "is", null)
      .lt("attempts", 8),
    supabase
      .from("class_meetings")
      .select("session_id, class_sessions!inner(teacher_id)", { count: "exact", head: true })
      .eq("class_sessions.teacher_id", teacherId)
      .gte("attempts", 8),
  ]);
  const missing = acc ? service(acc.provider as Provider).missingConfig() : null;

  return (
    <section className="card">
      <h2 className="mb-1 font-semibold">Online meetings</h2>
      <p className="mb-4 text-sm text-muted">
        Connect this teacher&apos;s own Zoom user or Google Workspace account. Classes booked without a link then get one automatically, moved
        and deleted with the class, and recordings are attached after class.
      </p>
      {missing && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          The server is not connected to {acc?.provider === "zoom" ? "Zoom" : "Google"} yet. Links will be created once these settings are added: {missing}.
        </p>
      )}
      <ActionForm action={saveMeetingAccount.bind(null, teacherId)}>
        <div>
          <label className="label" htmlFor="provider">Meeting service</label>
          <select className="input" id="provider" name="provider" defaultValue={acc?.provider ?? "none"}>
            <option value="none">None: links are typed in by hand</option>
            <option value="zoom">Zoom</option>
            <option value="google_meet">Google Meet</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="account_email">Teacher&apos;s Zoom or Google account email</label>
          <input className="input" id="account_email" name="account_email" type="email" defaultValue={acc?.account_email ?? ""} placeholder="teacher@yourschool.com" />
          <p className="mt-1 text-xs text-muted">Zoom: a licensed user in the school&apos;s Zoom account. Google: an address in the school&apos;s Google Workspace.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={acc?.active ?? true} />
          Create links automatically
        </label>
      </ActionForm>
      {acc?.active && (
        <div className="mt-4 border-t border-border pt-4">
          <ActionForm action={queueUpcomingMeetings.bind(null, teacherId)} submitLabel="Create links for upcoming classes" pendingText="Queuing…" className="space-y-2">
            <p className="text-sm text-muted">For classes already booked without a link.</p>
          </ActionForm>
          {(waiting ?? 0) > 0 && <p className="mt-3 text-sm text-muted">{waiting} link change{waiting === 1 ? "" : "s"} in progress.</p>}
          {(failing ?? 0) > 0 && (
            <p className="mt-2 text-sm text-red-700">
              {failing} class{failing === 1 ? "" : "es"} could not get a link. Open the class to see why and try again.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
