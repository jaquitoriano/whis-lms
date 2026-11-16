import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { zoomService } from "./zoom";
import { googleMeetService } from "./google";
import { fakeService } from "./fake";
import type { MeetingInput, MeetingRef, MeetingService } from "./types";

// Works the queue the database keeps in class_meetings (see the Phase 7b migration) and attaches
// recordings after class. Runs with the service role, right after a booking change (syncSoon)
// and from the 15-minute scheduled job.

export type Provider = "zoom" | "google_meet";

const fake = process.env.MEETINGS_FAKE === "1" && process.env.VERCEL_ENV !== "production";
export function service(p: Provider): MeetingService {
  if (fake) return p === "zoom" ? fakeService("Zoom", "zoom") : fakeService("Google Meet", "meet");
  return p === "zoom" ? zoomService : googleMeetService;
}

type Job = {
  session_id: string;
  provider: Provider;
  host_email: string;
  external_id: string | null;
  meeting_code: string | null;
  join_url: string | null;
  action: "create" | "update" | "delete" | "refresh";
  attempts: number;
};

type Db = ReturnType<typeof createAdminClient>;

async function meetingInput(db: Db, job: Job, autoRecord: boolean): Promise<MeetingInput | null> {
  const { data: s } = await db
    .from("class_sessions")
    .select("starts_at, ends_at, teacher:profiles!class_sessions_teacher_id_fkey(timezone), student:profiles!class_sessions_student_id_fkey(full_name), course:courses(name)")
    .eq("id", job.session_id)
    .maybeSingle();
  if (!s) return null;
  // Embedded rows can come back as an object or a one-item list.
  const one = <T,>(x: unknown) => (Array.isArray(x) ? x[0] : x) as T | null;
  const student = one<{ full_name: string }>(s.student)?.full_name ?? "";
  const course = one<{ name: string }>(s.course)?.name ?? "English class";
  return {
    hostEmail: job.host_email,
    // First name only: the meeting title is visible inside the teacher's Zoom or Google account.
    topic: `${course} – ${student.split(" ")[0] || "student"}`.slice(0, 190),
    startsAt: s.starts_at,
    endsAt: s.ends_at,
    timezone: one<{ timezone: string }>(s.teacher)?.timezone ?? "Asia/Manila",
    autoRecord,
    requestId: job.session_id,
  };
}

async function autoRecordSetting(db: Db) {
  const { data } = await db.from("settings").select("value").eq("key", "meetings_record_automatically").maybeSingle();
  return data?.value !== false;
}

async function runJob(db: Db, job: Job, autoRecord: boolean) {
  const svc = service(job.provider);
  const missing = svc.missingConfig();
  if (missing) throw new Error(`${svc.label} is not set up on the server yet (missing ${missing}).`);
  const ref: MeetingRef = { hostEmail: job.host_email, externalId: job.external_id ?? "", meetingCode: job.meeting_code };
  const done = { action: null, attempts: 0, last_error: null, claimed_at: null, synced_at: new Date().toISOString() };

  if (job.action === "delete") {
    if (job.external_id) await svc.remove(ref);
    await db.from("class_meetings").update({ ...done, deleted_at: new Date().toISOString() }).eq("session_id", job.session_id);
    return;
  }

  const input = await meetingInput(db, job, autoRecord);
  if (!input) return;

  if (job.action === "update" && job.external_id) {
    await svc.update(ref, input);
    await db.from("class_meetings").update(done).eq("session_id", job.session_id);
    return;
  }

  const made = job.action === "refresh" && job.external_id ? await svc.refresh(ref) : await svc.create(input);
  // Save the meeting first, then show its link on the class (the database trigger compares the two).
  await db
    .from("class_meetings")
    .update({ ...done, external_id: made.externalId, meeting_code: made.meetingCode ?? job.meeting_code, join_url: made.joinUrl, action: made.joinUrl ? null : "refresh" })
    .eq("session_id", job.session_id);
  if (made.joinUrl) {
    // Never overwrite a link someone typed in by hand.
    await db.from("class_sessions").update({ meeting_url: made.joinUrl }).eq("id", job.session_id).is("meeting_url", null);
  }
}

export async function runMeetingSync(opts: { limit?: number; sessionId?: string } = {}) {
  const db = createAdminClient();
  const { data: jobs, error } = await db.rpc("claim_meeting_jobs", { p_limit: opts.limit ?? 20, p_session: opts.sessionId ?? null });
  if (error) throw new Error(error.message);
  const autoRecord = await autoRecordSetting(db);
  let ok = 0;
  let failed = 0;
  for (const job of (jobs ?? []) as Job[]) {
    try {
      await runJob(db, job, autoRecord);
      ok++;
    } catch (e) {
      failed++;
      await db
        .from("class_meetings")
        .update({ attempts: job.attempts + 1, last_error: (e instanceof Error ? e.message : String(e)).slice(0, 1000), claimed_at: null })
        .eq("session_id", job.session_id);
    }
  }
  return { ok, failed };
}

// After class: look for recordings for up to 3 days, then stop. Zoom recordings follow the
// "share with the student" setting; Google Meet recordings stay with the teacher until shared,
// because the file in the teacher's Google Drive is not open to students by default.
const GIVE_UP_MS = 3 * 86400000;

export async function collectRecordings(limit = 20) {
  const db = createAdminClient();
  const now = Date.now();
  const { data: rows, error } = await db
    .from("class_meetings")
    .select("session_id, provider, host_email, external_id, meeting_code, recordings_checked_at, session:class_sessions!inner(ends_at, status)")
    .is("deleted_at", null)
    .not("external_id", "is", null)
    .eq("recordings_done", false)
    .lt("session.ends_at", new Date(now - 15 * 60000).toISOString())
    .in("session.status", ["scheduled", "completed"])
    .or(`recordings_checked_at.is.null,recordings_checked_at.lt."${new Date(now - 60 * 60000).toISOString()}"`)
    .limit(limit);
  if (error) throw new Error(error.message);
  let added = 0;
  for (const r of rows ?? []) {
    const session = (Array.isArray(r.session) ? r.session[0] : r.session) as { ends_at: string };
    let found: Awaited<ReturnType<MeetingService["recordings"]>> = [];
    try {
      const svc = service(r.provider as Provider);
      if (!svc.missingConfig()) found = await svc.recordings({ hostEmail: r.host_email, externalId: r.external_id!, meetingCode: r.meeting_code });
    } catch {
      // Try again in an hour.
    }
    if (found.length) {
      const { data: have } = await db.from("class_recordings").select("external_id").eq("session_id", r.session_id).not("external_id", "is", null);
      const known = new Set((have ?? []).map((h) => h.external_id));
      const fresh = found.filter((f) => !known.has(f.externalId));
      if (fresh.length) {
        await db.from("class_recordings").insert(
          fresh.map((f) => ({
            session_id: r.session_id,
            title: f.title,
            url: f.url,
            passcode: f.passcode,
            source: r.provider,
            external_id: f.externalId,
            added_by: null,
            ...(r.provider === "google_meet" ? { visible_to_student: false } : {}),
          })),
        );
        added += fresh.length;
      }
    }
    const giveUp = now - Date.parse(session.ends_at) > GIVE_UP_MS;
    await db
      .from("class_meetings")
      .update({ recordings_checked_at: new Date().toISOString(), recordings_done: found.length > 0 || giveUp })
      .eq("session_id", r.session_id);
  }
  return { checked: rows?.length ?? 0, added };
}

// Call after a booking change: the queue is worked once the response has gone back,
// so nobody waits for Zoom or Google. Anything left over is picked up by the scheduled job.
export function syncSoon() {
  after(async () => {
    try {
      await runMeetingSync({ limit: 40 });
    } catch (e) {
      console.error("meeting sync failed", e);
    }
  });
}
