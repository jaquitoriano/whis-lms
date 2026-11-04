"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { saveLessonRecord, setLessonShared } from "@/lib/session-actions";
import { LESSON_SECTIONS, SKILLS, type LessonField, type LessonRecord } from "@/lib/lesson-fields";

type Values = Record<LessonField, string> & { today_skills: string[]; private_notes: string };

// Lesson record with autosave (LES-05 / NFR-32): changes are saved ~1.5 s after the
// teacher stops typing, and again when they leave the page.
export function LessonRecordEditor({
  sessionId,
  record,
  privateNotes,
  previousHref,
}: {
  sessionId: string;
  record: LessonRecord;
  privateNotes: string;
  previousHref?: string;
}) {
  const initial = Object.fromEntries(LESSON_SECTIONS.flatMap((s) => s.fields.map((f) => [f.name, record[f.name] ?? ""]))) as Record<LessonField, string>;
  const [values, setValues] = useState<Values>({ ...initial, today_skills: record.today_skills ?? [], private_notes: privateNotes });
  const [status, setStatus] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [savedAt, setSavedAt] = useState<string>(record.updated_at);
  const [shared, setShared] = useState(record.shared_with_student);
  const [pending, startTransition] = useTransition();
  const dirty = useRef<Partial<Values>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    const patch = dirty.current;
    if (Object.keys(patch).length === 0) return;
    dirty.current = {};
    setStatus("saving");
    const r = await saveLessonRecord(sessionId, patch);
    if (r.ok) {
      setStatus(Object.keys(dirty.current).length ? "dirty" : "saved");
      if (r.savedAt) setSavedAt(r.savedAt);
    } else {
      dirty.current = { ...patch, ...dirty.current };
      setStatus("error");
    }
  }, [sessionId]);

  const update = <K extends keyof Values>(k: K, v: Values[K]) => {
    setValues((prev) => ({ ...prev, [k]: v }));
    dirty.current = { ...dirty.current, [k]: v };
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 1500);
  };

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(dirty.current).length) {
        void flush();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      if (timer.current) clearTimeout(timer.current);
      void flush();
    };
  }, [flush]);

  const statusText =
    status === "saving"
      ? "Saving…"
      : status === "dirty"
        ? "Unsaved changes"
        : status === "error"
          ? "Couldn't save. Retrying when you type again."
          : `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-5 -mt-5 flex flex-wrap items-center justify-between gap-3 rounded-t-xl border-b border-border bg-surface/95 px-5 py-3 backdrop-blur">
        <span className={`text-xs ${status === "error" ? "text-red-700" : "text-muted"}`} aria-live="polite">
          {statusText}
        </span>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={shared}
            disabled={pending}
            onChange={(e) => {
              const v = e.target.checked;
              setShared(v);
              startTransition(async () => {
                await flush();
                await setLessonShared(sessionId, v);
              });
            }}
          />
          Visible to student
        </label>
      </div>

      {LESSON_SECTIONS.map((section) => (
        <fieldset key={section.key} className="space-y-3">
          <legend className="mb-1 font-semibold">
            {section.title}
            {section.key === "previous" && previousHref && (
              <a href={previousHref} className="ml-2 text-xs font-normal text-brand-700 hover:underline">
                open previous class
              </a>
            )}
          </legend>
          {section.hint && <p className="-mt-2 text-xs text-muted">{section.hint}</p>}
          {section.key === "today" && (
            <div>
              <p className="label">Skills practised</p>
              <div className="flex flex-wrap gap-3">
                {SKILLS.map((s) => (
                  <label key={s} className="flex items-center gap-1.5 text-sm capitalize">
                    <input
                      type="checkbox"
                      checked={values.today_skills.includes(s)}
                      onChange={(e) =>
                        update("today_skills", e.target.checked ? [...values.today_skills, s] : values.today_skills.filter((x) => x !== s))
                      }
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {section.fields.map((f) => (
              <div key={f.name}>
                <label className="label" htmlFor={f.name}>
                  {f.label}
                </label>
                <textarea
                  id={f.name}
                  className="input min-h-20"
                  value={values[f.name]}
                  maxLength={10000}
                  onChange={(e) => update(f.name, e.target.value)}
                  onBlur={() => void flush()}
                />
              </div>
            ))}
          </div>
        </fieldset>
      ))}

      <fieldset>
        <legend className="mb-1 font-semibold">Private notes</legend>
        <p className="mb-2 text-xs text-muted">Only you and the school office can see these. Never shown to the student.</p>
        <textarea
          className="input min-h-16"
          value={values.private_notes}
          maxLength={10000}
          onChange={(e) => update("private_notes", e.target.value)}
          onBlur={() => void flush()}
          aria-label="Private notes"
        />
      </fieldset>
    </div>
  );
}
