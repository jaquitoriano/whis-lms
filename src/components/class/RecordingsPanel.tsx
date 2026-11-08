import type { SupabaseClient } from "@supabase/supabase-js";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { addRecording, deleteRecording, setRecordingShared } from "@/lib/recording-actions";

type Recording = { id: string; title: string; url: string; passcode: string | null; visible_to_student: boolean; created_at: string };

// Class recordings (REC-01..02): links to Zoom / Google Meet recordings; no video is stored here.
// Students see only recordings shared with them (the database filters the rest out).
export async function RecordingsPanel({
  supabase,
  sessionId,
  canManage,
  isStudent,
  sharedByDefault,
  classOver,
}: {
  supabase: SupabaseClient;
  sessionId: string;
  canManage: boolean;
  isStudent: boolean;
  sharedByDefault: boolean;
  classOver: boolean;
}) {
  const { data } = await supabase.from("class_recordings").select("id, title, url, passcode, visible_to_student, created_at").eq("session_id", sessionId).order("created_at");
  const recs = (data ?? []) as Recording[];
  if (!canManage && recs.length === 0 && !isStudent) return null;
  if (isStudent && recs.length === 0 && !classOver) return null;

  return (
    <section id="recordings" className="card scroll-mt-20">
      <h2 className="mb-3 font-semibold">Recording</h2>
      {recs.length === 0 && <p className="text-sm text-muted">{isStudent ? "No recording has been shared for this class." : "No recording yet."}</p>}
      <ul className="space-y-3">
        {recs.map((r, i) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
                {r.title || (recs.length > 1 ? `Watch recording (part ${i + 1})` : "Watch recording")} ↗
              </a>
              {r.passcode && <p className="text-xs text-muted">Passcode: <span className="font-mono text-foreground">{r.passcode}</span></p>}
              {canManage && (
                <p className="text-xs">
                  {r.visible_to_student ? <span className="text-green-700">Shared with the student</span> : <span className="text-amber-700">Not shared with the student</span>}
                </p>
              )}
            </div>
            {canManage && (
              <div className="flex gap-2">
                <form action={setRecordingShared.bind(null, sessionId, r.id, !r.visible_to_student)}>
                  <SubmitButton className="btn-secondary px-2 py-1 text-xs" pendingText="…">
                    {r.visible_to_student ? "Stop sharing" : "Share with student"}
                  </SubmitButton>
                </form>
                <form action={deleteRecording.bind(null, sessionId, r.id)}>
                  <SubmitButton className="btn-danger px-2 py-1 text-xs" pendingText="…">
                    Remove
                  </SubmitButton>
                </form>
              </div>
            )}
          </li>
        ))}
      </ul>
      {isStudent && recs.length > 0 && <p className="mt-3 text-xs text-muted">Recordings are kept by Zoom or Google and may expire after a while.</p>}
      {canManage && (
        <ActionForm action={addRecording.bind(null, sessionId)} submitLabel="Add recording" resetOnSuccess className="mt-4 space-y-2 border-t border-border pt-4">
          <input className="input" name="rec_url" type="url" placeholder="Recording link (https://…)" aria-label="Recording link" required />
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="input" name="rec_title" placeholder="Title (optional)" aria-label="Recording title" />
            <input className="input" name="rec_passcode" placeholder="Passcode (if any)" aria-label="Recording passcode" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="rec_shared" defaultChecked={sharedByDefault} /> Share with the student
          </label>
        </ActionForm>
      )}
    </section>
  );
}
