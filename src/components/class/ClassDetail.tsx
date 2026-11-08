import Link from "@/components/Link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { LessonRecordEditor } from "./LessonRecordEditor";
import { MaterialUploader } from "./MaterialUploader";
import { YouTubePlayer } from "./YouTubePlayer";
import { StatusPanel } from "./StatusPanel";
import { AttendancePanel } from "./AttendancePanel";
import { getBillingSettings } from "@/lib/billing";
import { getSession, statusLabel, statusStyle, classPath } from "@/lib/sessions";
import { LESSON_SECTIONS, type LessonRecord } from "@/lib/lesson-fields";
import { formatDateTime, minutesBetween, toDateStr, toTimeStr, tzLabel } from "@/lib/time";
import { listHomework } from "@/lib/homework";
import { HomeworkStatusBadges } from "@/components/homework/HomeworkTable";
import { addMaterialLink, addVideo, deleteMaterial, deleteVideo, updateMeetingLink } from "@/lib/session-actions";
import { openConversation } from "@/lib/message-actions";
import type { Profile } from "@/lib/types";

type Material = {
  id: string;
  title: string;
  unit_chapter: string;
  pages: string;
  kind: "file" | "link";
  storage_path: string | null;
  file_name: string | null;
  size_bytes: number | null;
  url: string | null;
};
type Video = { id: string; youtube_id: string; title: string; description: string };

function fileSize(n: number | null) {
  if (!n) return "";
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
}

// The class page (CAL-01..04, MAT, LES, VID). Admins and the class's teacher manage it;
// the student and the student's other teachers read it.
export async function ClassDetail({ supabase, viewer, id }: { supabase: SupabaseClient; viewer: Profile; id: string }) {
  const s = await getSession(supabase, id);
  if (!s) notFound();

  const canManage = viewer.role === "admin" || (viewer.role === "teacher" && s.teacher_id === viewer.id);
  const isStudent = viewer.role === "student";
  const tz = viewer.timezone;

  await (canManage ? supabase.rpc("ensure_lesson_record", { p_session: id }) : Promise.resolve());
  const isAdmin = viewer.role === "admin";
  const [{ data: materials }, { data: videos }, { data: record }, { data: priv }, { data: next }, homework, { data: attendance }, settings, { data: enrollments }] = await Promise.all([
    supabase.from("materials").select("*").eq("session_id", id).order("created_at"),
    supabase.from("videos").select("*").eq("session_id", id).order("created_at"),
    supabase.from("lesson_records").select("*").eq("session_id", id).maybeSingle(),
    canManage ? supabase.from("lesson_private_notes").select("notes").eq("session_id", id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("class_sessions").select("id").eq("rescheduled_from_id", id).maybeSingle(),
    listHomework(supabase, { sessionId: id }),
    supabase.from("attendance").select("mark, minutes_late, note").eq("session_id", id).maybeSingle(),
    getBillingSettings(supabase),
    isAdmin
      ? supabase.from("enrollments").select("id, package_name, starts_on, status").eq("student_id", s.student_id).order("starts_on", { ascending: false })
      : Promise.resolve({ data: null }),
  ]);
  const isOwnerTeacher = viewer.role === "teacher" && s.teacher_id === viewer.id;
  const mats = (materials ?? []) as Material[];
  const vids = (videos ?? []) as Video[];
  const rec = record as LessonRecord | null;

  const paths = mats.filter((m) => m.kind === "file" && m.storage_path).map((m) => m.storage_path!);
  const signed = paths.length ? (await supabase.storage.from("materials").createSignedUrls(paths, 60 * 60)).data ?? [] : [];
  const urlFor = (p: string | null) => signed.find((x) => x.path === p)?.signedUrl;

  const other = isStudent ? s.teacher : s.student;
  const otherTz = other?.timezone && other.timezone !== tz ? other.timezone : null;
  const active = s.status === "scheduled";
  const backHref = `/${viewer.role}/calendar?view=week&date=${toDateStr(new Date(s.starts_at), tz)}`;

  return (
    <div className="space-y-6">
      <Link href={backHref} className="inline-block text-sm text-muted hover:text-foreground">
        ← Back to calendar
      </Link>

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted">{s.course?.name ?? "Class"}</p>
            <h1 className="mt-1 text-2xl font-semibold">{formatDateTime(s.starts_at, tz, { year: "numeric" })}</h1>
            <p className="mt-1 text-sm text-muted">
              until {formatDateTime(s.ends_at, tz, { weekday: undefined, day: undefined, month: undefined })} · {minutesBetween(s.starts_at, s.ends_at)} minutes · {tzLabel(tz)}
            </p>
            {otherTz && (
              <p className="mt-1 text-xs text-muted">
                For {other!.full_name}: {formatDateTime(s.starts_at, otherTz)} ({tzLabel(otherTz)})
              </p>
            )}
          </div>
          <span className={`badge border ${statusStyle[s.status]}`}>{statusLabel[s.status]}</span>
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Teacher</dt>
            <dd>{s.teacher?.full_name}</dd>
          </div>
          <div>
            <dt className="text-muted">Student</dt>
            <dd>
              {viewer.role === "teacher" ? (
                <Link className="hover:text-brand-700" href={`/teacher/students/${s.student_id}`}>
                  {s.student?.full_name}
                </Link>
              ) : viewer.role === "admin" ? (
                <Link className="hover:text-brand-700" href={`/admin/users/${s.student_id}?role=student`}>
                  {s.student?.full_name}
                </Link>
              ) : (
                s.student?.full_name
              )}
            </dd>
          </div>
          {s.status_reason && (
            <div>
              <dt className="text-muted">Note</dt>
              <dd>{s.status_reason}</dd>
            </div>
          )}
        </dl>

        {s.rescheduled_from_id && (
          <p className="mt-3 text-sm">
            Moved from an earlier time.{" "}
            <Link href={classPath(viewer.role, s.rescheduled_from_id)} className="text-brand-700 hover:underline">
              See original
            </Link>
          </p>
        )}
        {next && (
          <p className="mt-3 text-sm">
            This class was rescheduled.{" "}
            <Link href={classPath(viewer.role, next.id)} className="font-medium text-brand-700 hover:underline">
              Go to the new time →
            </Link>
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {s.meeting_url && active && (
            <a href={s.meeting_url} target="_blank" rel="noopener noreferrer" className="btn-primary">
              Join class
            </a>
          )}
          {!s.meeting_url && active && <p className="text-sm text-muted">The meeting link will appear here.</p>}
          {/* MSG-01: class-linked conversation, for the class's own teacher and student. */}
          {(isOwnerTeacher || (isStudent && s.student_id === viewer.id)) && (
            <form action={openConversation}>
              <input type="hidden" name="session" value={id} />
              <SubmitButton className="btn-secondary" pendingText="Opening…">
                Message about this class
              </SubmitButton>
            </form>
          )}
        </div>

        {canManage && (
          <div className="mt-5 space-y-4 border-t border-border pt-4">
            <StatusPanel
              sessionId={id}
              isAdmin={viewer.role === "admin"}
              status={s.status}
              defaultDate={toDateStr(new Date(s.starts_at), tz)}
              defaultTime={toTimeStr(new Date(s.starts_at), tz)}
              tzLabel={tzLabel(tz)}
              lateCancelHours={settings.late_cancel_hours}
              startsAt={s.starts_at}
            />
            {active && (
              <ActionForm action={updateMeetingLink.bind(null, id)} submitLabel="Save link" className="flex flex-wrap items-start gap-2">
                <input
                  className="input max-w-md"
                  name="meeting_url"
                  type="url"
                  defaultValue={s.meeting_url ?? ""}
                  placeholder="https://zoom.us/j/… or https://meet.google.com/…"
                  aria-label="Meeting link"
                />
              </ActionForm>
            )}
          </div>
        )}
      </section>

      <AttendancePanel
        sessionId={id}
        status={s.status}
        attendance={attendance}
        canEdit={canManage}
        isAdmin={isAdmin}
        billing={{
          counts_as_used: s.counts_as_used,
          late_cancel: s.late_cancel,
          cancel_requested_by: s.cancel_requested_by,
          enrollment_id: s.enrollment_id,
          enrollments: (enrollments ?? []).map((e) => ({ id: e.id, label: `${e.package_name} (from ${e.starts_on}${e.status !== "active" ? `, ${e.status}` : ""})` })),
        }}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">Learning materials</h2>
          {mats.length === 0 ? (
            <p className="text-sm text-muted">No materials yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {mats.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <a
                      href={m.kind === "file" ? urlFor(m.storage_path) : m.url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {m.title}
                    </a>
                    <p className="text-xs text-muted">
                      {[m.unit_chapter, m.pages, m.kind === "file" ? `${m.file_name} ${fileSize(m.size_bytes)}` : "Link"].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {canManage && (
                    <form action={deleteMaterial.bind(null, id, m.id)}>
                      <SubmitButton className="btn-danger px-2 py-1 text-xs" pendingText="…">
                        Remove
                      </SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canManage && (
            <div className="mt-4 space-y-4 border-t border-border pt-4">
              <MaterialUploader sessionId={id} />
              <details>
                <summary className="cursor-pointer text-sm text-brand-700">Add a link instead</summary>
                <ActionForm action={addMaterialLink.bind(null, id)} submitLabel="Add link" resetOnSuccess className="mt-3 space-y-2">
                  <input className="input" name="title" placeholder="Title" aria-label="Link title" required />
                  <input className="input" name="url" type="url" placeholder="https://…" aria-label="Link URL" required />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input className="input" name="unit_chapter" placeholder="Unit / chapter" aria-label="Unit or chapter" />
                    <input className="input" name="pages" placeholder="Pages" aria-label="Pages" />
                  </div>
                </ActionForm>
              </details>
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">Videos</h2>
          {vids.length === 0 && <p className="text-sm text-muted">No videos yet.</p>}
          <div className="space-y-4">
            {vids.map((v) => (
              <div key={v.id}>
                <YouTubePlayer id={v.youtube_id} title={v.title} />
                <div className="mt-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{v.title}</p>
                    {v.description && <p className="text-xs text-muted">{v.description}</p>}
                  </div>
                  {canManage && (
                    <form action={deleteVideo.bind(null, id, v.id)}>
                      <SubmitButton className="btn-danger px-2 py-1 text-xs" pendingText="…">
                        Remove
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
          {canManage && (
            <ActionForm action={addVideo.bind(null, id)} submitLabel="Add video" resetOnSuccess className="mt-4 space-y-2 border-t border-border pt-4">
              <input className="input" name="url" placeholder="YouTube link" aria-label="YouTube link" required />
              <input className="input" name="title" placeholder="Title" aria-label="Video title" required />
              <input className="input" name="description" placeholder="Description (optional)" aria-label="Video description" />
            </ActionForm>
          )}
        </section>
      </div>

      <section className="card">
        <h2 className="mb-4 font-semibold">Lesson record</h2>
        {canManage && rec ? (
          <LessonRecordEditor
            sessionId={id}
            record={rec}
            privateNotes={(priv as { notes: string } | null)?.notes ?? ""}
            previousHref={rec.previous_session_id ? classPath(viewer.role, rec.previous_session_id) : undefined}
          />
        ) : rec ? (
          <LessonRecordView rec={rec} />
        ) : (
          <p className="text-sm text-muted">
            {isStudent ? "Your teacher's notes and feedback will appear here after the class." : "No lesson record yet."}
          </p>
        )}
      </section>

      <section className="card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Homework</h2>
          {isOwnerTeacher && (
            <Link href={`/teacher/homework/new?session=${id}`} className="btn-primary">
              Assign homework
            </Link>
          )}
        </div>
        {homework.length === 0 ? (
          <p className="text-sm text-muted">No homework for this class.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {homework.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/${viewer.role}/homework/${h.id}`} className="font-medium text-brand-700 hover:underline">
                  {h.title}
                </Link>
                <span className="flex items-center gap-2 text-xs text-muted">
                  due {formatDateTime(h.due_at, tz)} <HomeworkStatusBadges h={h} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function LessonRecordView({ rec }: { rec: LessonRecord }) {
  return (
    <div className="space-y-6">
      {LESSON_SECTIONS.map((section) => {
        const filled = section.fields.filter((f) => rec[f.name]?.trim());
        const skills = section.key === "today" && rec.today_skills?.length ? rec.today_skills : [];
        if (!filled.length && !skills.length) return null;
        return (
          <div key={section.key}>
            <h3 className="mb-2 font-medium">{section.title}</h3>
            {skills.length > 0 && (
              <p className="mb-2 flex flex-wrap gap-1">
                {skills.map((s) => (
                  <span key={s} className="badge bg-brand-50 capitalize text-brand-700">
                    {s}
                  </span>
                ))}
              </p>
            )}
            <dl className="grid gap-3 text-sm md:grid-cols-2">
              {filled.map((f) => (
                <div key={f.name}>
                  <dt className="text-muted">{f.label}</dt>
                  <dd className="whitespace-pre-line">{rec[f.name]}</dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </div>
  );
}
