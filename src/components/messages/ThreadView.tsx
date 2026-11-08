import Link from "@/components/Link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Avatar } from "@/components/ui";
import { getThread, otherParty } from "@/lib/messages";
import { sendMessage } from "@/lib/message-actions";
import { formatDay, formatTime, toDateStr, tzLabel } from "@/lib/time";
import { classPath } from "@/lib/sessions";
import type { Profile } from "@/lib/types";
import { Composer } from "./Composer";
import { LiveRefresh } from "./LiveRefresh";
import { ScrollToEnd } from "./ScrollToEnd";
import { threadTitle } from "./ThreadList";

function size(n: number | null) {
  if (!n) return "";
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
}

// One conversation (MSG-01). Opening it marks it read for the participant; an admin's visit is
// written to the audit log instead. Only the two participants can write, and only while the
// teacher is assigned to the student.
export async function ThreadView({ supabase, viewer, id }: { supabase: SupabaseClient; viewer: Profile; id: string }) {
  const isAdmin = viewer.role === "admin";
  const data = await getThread(supabase, id);
  if (!data) notFound();
  await supabase.rpc(isAdmin ? "log_thread_view" : "mark_thread_read", { p_thread: id });
  const { thread: t, messages, canWrite, truncated } = data;
  const tz = viewer.timezone;
  const { person, fallback } = otherParty(t, viewer);
  const title = isAdmin ? `${t.teacher?.full_name ?? "Teacher"} and ${t.student?.full_name ?? "student"}` : (person?.full_name ?? fallback);
  const latest = messages.at(-1)?.created_at ?? null;
  const names = new Map([
    [t.teacher_id, t.teacher?.full_name ?? "Former teacher"],
    [t.student_id, t.student?.full_name ?? "Student"],
  ]);
  const days = messages.map((m) => toDateStr(new Date(m.created_at), tz));

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/${viewer.role}/messages`} className="mb-4 inline-block text-sm text-muted hover:text-foreground">
        ← Messages
      </Link>
      <header className="mb-4 flex items-center gap-3">
        <Avatar profile={isAdmin ? (t.student ?? { full_name: "?", avatar_url: null }) : (person ?? { full_name: fallback, avatar_url: null })} size={44} />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted">
            {t.session_id ? (
              <Link href={classPath(viewer.role, t.session_id)} className="text-brand-700 hover:underline">
                {threadTitle(t, tz)}
              </Link>
            ) : (
              threadTitle(t, tz)
            )}
          </p>
        </div>
      </header>

      {isAdmin && (
        <p className="mb-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
          You are reading this as the school office. Admins can&apos;t post here, and this visit is recorded in the audit log.
        </p>
      )}

      <section className="card" aria-label="Messages">
        {truncated && <p className="mb-3 text-center text-xs text-muted">Showing the latest 300 messages.</p>}
        {messages.length === 0 && <p className="py-6 text-center text-sm text-muted">No messages yet. Say hello!</p>}
        <ol className="space-y-3">
          {messages.map((m, i) => {
            const mine = m.sender_id === viewer.id;
            const day = days[i];
            const showDay = i === 0 || day !== days[i - 1];
            const fromTeacher = m.sender_id === t.teacher_id;
            const side = isAdmin ? !fromTeacher : mine;
            return (
              <li key={m.id} id={`m-${m.id}`}>
                {showDay && <p className="my-3 text-center text-xs font-medium text-muted">{formatDay(day, { weekday: "long", day: "numeric", month: "long" })}</p>}
                <div className={`flex ${side ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm sm:max-w-[75%] ${side ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-slate-100 text-foreground"}`}>
                    {(isAdmin || !mine) && <p className={`mb-0.5 text-xs font-medium ${side ? "text-brand-100" : "text-muted"}`}>{names.get(m.sender_id ?? "") ?? "Former user"}</p>}
                    {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    {m.files.length > 0 && (
                      <ul className="mt-2 space-y-2">
                        {m.files.map((f) =>
                          f.url && f.mime_type && /^image\/(jpeg|png|webp|gif)$/.test(f.mime_type) ? (
                            <li key={f.id}>
                              <a href={f.url} target="_blank" rel="noopener noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={f.url} alt={f.file_name} className="max-h-64 rounded-lg" loading="lazy" />
                              </a>
                            </li>
                          ) : (
                            <li key={f.id}>
                              <a
                                href={f.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`inline-flex items-center gap-2 rounded-lg px-2 py-1 underline ${side ? "bg-brand-700" : "bg-white"}`}
                              >
                                {f.file_name}
                                <span className={side ? "text-brand-100" : "text-muted"}>{size(f.size_bytes)}</span>
                              </a>
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                    <p className={`mt-1 text-right text-[11px] ${side ? "text-brand-100" : "text-muted"}`}>{formatTime(m.created_at, tz)}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <ScrollToEnd marker={latest} />
      </section>

      {!isAdmin && (
        <section className="card mt-4">
          {canWrite ? (
            <>
              <Composer threadId={t.id} viewerId={viewer.id} action={sendMessage.bind(null, t.id)} />
              <p className="mt-3 text-xs text-muted">
                Times are in {tzLabel(tz)}. For safety, the school office can read messages. Please don&apos;t share passwords or payment details here.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">
              {viewer.role === "student"
                ? "This teacher is no longer assigned to you, so you can read this conversation but can't reply. Contact the school office if you need help."
                : "You can't reply in this conversation."}
            </p>
          )}
          <LiveRefresh threadId={t.id} latest={latest} />
        </section>
      )}
    </div>
  );
}
