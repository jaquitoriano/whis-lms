"use client";

import { startTransition, useActionState, useState } from "react";
import { FormMessage } from "@/components/ui";
import { CEFR_STEPS, SKILLS, cefrDescription, cefrLabel, type ProgressReport } from "@/lib/progress-shared";
import type { ActionState } from "@/lib/types";

function Buttons({ published, pending }: { published: boolean; pending: boolean }) {
  if (published)
    return (
      <button type="submit" name="intent" value="draft" className="btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </button>
    );
  return (
    <>
      <button type="submit" name="intent" value="publish" className="btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Publish to student"}
      </button>
      <button type="submit" name="intent" value="draft" className="btn-secondary" disabled={pending}>
        Save draft
      </button>
    </>
  );
}

function LevelSelect({ name, label, value, onChange, required }: { name: string; label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor={`lvl-${name}`}>
        {label}
      </label>
      {/* Not `required` in HTML: a draft can be saved without an overall level; publishing checks it. */}
      <select id={`lvl-${name}`} name={name} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{required ? "Choose…" : "Not assessed"}</option>
        {CEFR_STEPS.map((v) => (
          <option key={v} value={v}>
            {cefrLabel(v)} · {cefrDescription(v)}
          </option>
        ))}
      </select>
    </div>
  );
}

// The progress report form (PRG-01..02): CEFR level per skill, an overall level, and three
// short comments. Drafts are private to the teacher until published.
export function ReportEditor({
  report,
  action,
}: {
  report: ProgressReport;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const start = Object.fromEntries([...SKILLS.map((s) => s.key), "overall"].map((k) => [k, report[k as keyof ProgressReport] == null ? "" : String(report[k as keyof ProgressReport])]));
  const [levels, setLevels] = useState<Record<string, string>>(start);
  const [text, setText] = useState({
    period_start: report.period_start,
    period_end: report.period_end,
    summary: report.summary,
    strengths: report.strengths,
    next_goals: report.next_goals,
  });
  const bind = (k: keyof typeof text) => ({ name: k, id: k, value: text[k], onChange: (e: { target: { value: string } }) => setText((t) => ({ ...t, [k]: e.target.value })) });
  const published = report.status === "published";

  const rated = SKILLS.map((s) => levels[s.key]).filter(Boolean).map(Number);
  const avg = rated.length ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 2) / 2 : null;
  const set = (k: string) => (v: string) => setLevels((l) => ({ ...l, [k]: v }));

  return (
    // Submitted by hand rather than with `action`: React resets a form after an action, which would
    // blank the level dropdowns on screen while their saved values are still in state.
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(fd));
      }}
    >
      <FormMessage state={state} />
      <section className="card space-y-4">
        <h2 className="font-semibold">Period</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="period_start">
              From
            </label>
            <input type="date" className="input" required {...bind("period_start")} />
          </div>
          <div>
            <label className="label" htmlFor="period_end">
              To
            </label>
            <input type="date" className="input" required {...bind("period_end")} />
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="font-semibold">Skill levels</h2>
          <p className="mt-1 text-sm text-muted">CEFR levels; &quot;+&quot; means well into the level and close to the next. Leave a skill as &quot;Not assessed&quot; if you didn&apos;t work on it.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          {SKILLS.map((s) => (
            <LevelSelect key={s.key} name={s.key} label={s.label} value={levels[s.key]} onChange={set(s.key)} />
          ))}
        </div>
        <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2 2xl:grid-cols-4">
          <LevelSelect name="overall" label="Overall level" value={levels.overall} onChange={set("overall")} required />
          {avg !== null && (
            <p className="self-end pb-2 text-sm text-muted sm:col-span-1 2xl:col-span-3">
              Average of the skills: <strong className="text-foreground">{cefrLabel(avg)}</strong>
              {levels.overall !== String(avg) && (
                <button type="button" className="ml-2 text-brand-700 hover:underline" onClick={() => set("overall")(String(avg))}>
                  Use this
                </button>
              )}
            </p>
          )}
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">Comments</h2>
        <div>
          <label className="label" htmlFor="summary">
            Summary
          </label>
          <textarea className="input min-h-28" maxLength={5000} {...bind("summary")} placeholder="How the student has done this period, in a few sentences." />
        </div>
        <div>
          <label className="label" htmlFor="strengths">
            Strengths
          </label>
          <textarea className="input min-h-20" maxLength={5000} {...bind("strengths")} />
        </div>
        <div>
          <label className="label" htmlFor="next_goals">
            Goals for the next period
          </label>
          <textarea className="input min-h-20" maxLength={5000} {...bind("next_goals")} />
        </div>
        <p className="text-xs text-muted">Formatting: **bold**, *italic*, and lines starting with &quot;- &quot; for a list.</p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Buttons published={published} pending={pending} />
        <span className="text-sm text-muted">
          {published ? "The student sees your changes straight away. Changes are recorded in the audit log." : "The student is notified when you publish."}
        </span>
      </div>
    </form>
  );
}
