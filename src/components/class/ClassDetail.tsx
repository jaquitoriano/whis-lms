import Link from "next/link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { LessonRecordEditor } from "./LessonRecordEditor";
import { MaterialUploader } from "./MaterialUploader";
import { StatusPanel } from "./StatusPanel";
import { getSession, statusLabel, statusStyle, classPath } from "@/lib/sessions";
import { LESSON_SECTIONS, type LessonRecord } from "@/lib/lesson-fields";
import { formatDateTime, minutesBetween, toDateStr, toTimeStr, tzLabel } from "@/lib/time";
import { listHomework } from "@/lib/homework";
import { HomeworkStatusBadges } from "@/components/homework/HomeworkTable";
import { addMaterialLink, addVideo, deleteMaterial, deleteVideo, updateMeetingLink } from "@/lib/session-actions";
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
  const [{ data: materials }, { data: videos }, { data: record }, { data: priv }, { data: next }] = await Promise.all([
    supabase.from("materials").select("*").eq("session_id", id).order("created_at"),
    supabase.from("videos").select("*").eq("session_id", id).order("created_at"),
    supabase.from("lesson_records").select("*").eq("session_id", id).maybeSingle(),
    canManage ? supabase.from("lesson_private_notes").select("notes").eq("session_id", id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("class_sessions").select("id").eq("rescheduled_from_id", id).maybeSingle(),
  ]);
  const homework = await listHomework(supabase, { sessionId: id });
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

      <div className="grid gap-6 lg:grid-cols-2">
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
                <div className="aspect-video overflow-hidden rounded-lg bg-slate-100">
                  <iframe
                    className="h-full w-full"
                    src={`https://www.youtube-nocookie.com/embed/${v.youtube_id}`}
                    title={v.title}
                    loading="lazy"
                    allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
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
