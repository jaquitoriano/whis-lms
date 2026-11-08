"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import Link from "@/components/Link";
import { FormMessage } from "@/components/ui";
import { BAND_STEPS, IELTS_KIND_LABEL, IELTS_MODULE_LABEL, IELTS_SKILLS, fmtBand, overallBand, type IeltsResult, type IeltsSkill } from "@/lib/progress-shared";
import type { ActionState } from "@/lib/types";

// Add or correct an IELTS result (PRG-03). The overall band is shown as the teacher types, using
// the same rule as the database, which stores the official value.
export function IeltsForm({
  action,
  initial,
  today,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: IeltsResult | null;
  today: string;
  cancelHref?: string;
}) {
  const blank = { listening: "", reading: "", writing: "", speaking: "" } as Record<IeltsSkill, string>;
  const start = initial ? (Object.fromEntries(IELTS_SKILLS.map((s) => [s.key, initial[s.key] === null ? "" : String(initial[s.key])])) as Record<IeltsSkill, string>) : blank;
  const [bands, setBands] = useState(start);
  const form = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await action(prev, fd);
    if (result.ok && !initial) {
      form.current?.reset();
      setBands(blank);
    }
    return result;
  }, {});

  const values = IELTS_SKILLS.map((s) => (bands[s.key] === "" ? null : Number(bands[s.key])));
  const overall = overallBand(values);
  const entered = values.filter((v) => v !== null).length;

  return (
    // Submitted by hand (see ReportEditor): an automatic reset would blank the band dropdowns.
    <form
      ref={form}
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <FormMessage state={state} />
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="ielts-kind">
            Test
          </label>
          <select id="ielts-kind" name="kind" className="input" defaultValue={initial?.kind ?? "mock"}>
            {Object.entries(IELTS_KIND_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ielts-module">
            Module
          </label>
          <select id="ielts-module" name="module" className="input" defaultValue={initial?.module ?? "academic"}>
            {Object.entries(IELTS_MODULE_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ielts-date">
            Test date
          </label>
          <input id="ielts-date" name="test_date" type="date" className="input" max={today} defaultValue={initial?.test_date ?? today} required />
        </div>
      </div>
      <fieldset>
        <legend className="label">Bands</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {IELTS_SKILLS.map((s) => (
            <div key={s.key}>
              <label className="mb-1 block text-xs text-muted" htmlFor={`ielts-${s.key}`}>
                {s.label}
              </label>
              <select
                id={`ielts-${s.key}`}
                name={s.key}
                className="input tabular-nums"
                value={bands[s.key]}
                onChange={(e) => setBands((b) => ({ ...b, [s.key]: e.target.value }))}
              >
                <option value="">—</option>
                {BAND_STEPS.map((v) => (
                  <option key={v} value={v}>
                    {v.toFixed(1)}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="col-span-2 rounded-lg bg-brand-50 px-3 py-2 sm:col-span-1">
            <p className="text-xs text-brand-700">Overall band</p>
            <p className="text-xl font-semibold tabular-nums text-brand-700" aria-live="polite">
              {fmtBand(overall)}
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">
          {entered > 0 && entered < 4
            ? "A practice test of fewer than four skills has no overall band."
            : "The average of the four skills, rounded to the nearest half band (.25 rounds up to .5, .75 up to the next band)."}
        </p>
      </fieldset>
      <div>
        <label className="label" htmlFor="ielts-notes">
          Notes (optional)
        </label>
        <input id="ielts-notes" name="notes" className="input" maxLength={2000} defaultValue={initial?.notes ?? ""} placeholder="e.g. Cambridge IELTS 18, Test 2" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : initial ? "Save changes" : "Save result"}
        </button>
        {cancelHref && (
          <Link href={cancelHref} className="text-sm text-muted hover:text-foreground">
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
