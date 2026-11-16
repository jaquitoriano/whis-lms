"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { saveLessonRecord, setLessonShared } from "@/lib/session-actions";
import { LESSON_BOXES, LESSON_NOTE_MAX, type LessonBox, type LessonRecord } from "@/lib/lesson-fields";

type Values = Record<LessonBox, string> & { private_notes: string };

// Lesson record with autosave (LES-05 / NFR-32): changes are saved ~1.5 s after the
// teacher stops typing, and again when they leave the page.
// Four large boxes (change request T4). An empty box shows its template of labels;
// the template is only saved once the teacher writes in that box.
export function LessonRecordEditor({
  sessionId,
  record,
  privateNotes,
}: {
  sessionId: string;
  record: LessonRecord;
  privateNotes: string;
}) {
  const [values, setValues] = useState<Values>({
    ...(Object.fromEntries(LESSON_BOXES.map((b) => [b.name, record[b.name] || b.template])) as Record<LessonBox, string>),
    private_notes: privateNotes,
  });
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

      {LESSON_BOXES.map((box) => (
        <div key={box.name}>
          <label className="mb-1 block font-semibold" htmlFor={box.name}>
            {box.title}
          </label>
          {"hint" in box && <p className="mb-2 text-xs text-muted">{box.hint}</p>}
          <textarea
            id={box.name}
            className="input min-h-44 leading-relaxed"
            value={values[box.name]}
            maxLength={LESSON_NOTE_MAX}
            onChange={(e) => update(box.name, e.target.value)}
            onBlur={() => void flush()}
          />
        </div>
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
