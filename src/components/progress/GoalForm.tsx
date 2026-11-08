"use client";

import { startTransition, useActionState } from "react";
import { FormMessage } from "@/components/ui";
import { BAND_STEPS, type IeltsGoal } from "@/lib/progress-shared";
import type { ActionState } from "@/lib/types";

// IELTS target band and exam date. Submitted by hand so the saved choice stays on screen.
export function GoalForm({ goal, action }: { goal: IeltsGoal | null; action: (prev: ActionState, formData: FormData) => Promise<ActionState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <FormMessage state={state} />
      <div>
        <label className="label" htmlFor="target_overall">
          Target overall band
        </label>
        <select id="target_overall" name="target_overall" className="input" defaultValue={goal?.target_overall != null ? String(Number(goal.target_overall)) : ""}>
          <option value="">Not set</option>
          {BAND_STEPS.filter((v) => v >= 4).map((v) => (
            <option key={v} value={v}>
              {v.toFixed(1)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="exam_date">
          Exam date
        </label>
        <input id="exam_date" name="exam_date" type="date" className="input" defaultValue={goal?.exam_date ?? ""} />
      </div>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save target"}
      </button>
    </form>
  );
}
