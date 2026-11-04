"use client";

import { useActionState, useState } from "react";
import { setClassStatus, rescheduleClass } from "@/lib/session-actions";
import { FormMessage } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export function StatusPanel({
  sessionId,
  isAdmin,
  status,
  defaultDate,
  defaultTime,
  tzLabel,
}: {
  sessionId: string;
  isAdmin: boolean;
  status: string;
  defaultDate: string;
  defaultTime: string;
  tzLabel: string;
}) {
  const [state, action] = useActionState(setClassStatus.bind(null, sessionId), {});
  const [rState, rAction] = useActionState(rescheduleClass.bind(null, sessionId), {});
  const [mode, setMode] = useState<"none" | "cancel" | "reschedule">("none");

  if (status !== "scheduled") {
    if (!isAdmin) return null;
    return (
      <form action={action} className="space-y-2">
        <FormMessage state={state} />
        <input type="hidden" name="status" value="scheduled" />
        <SubmitButton className="btn-secondary text-xs" pendingText="Updating…">
          Reopen as scheduled
        </SubmitButton>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <FormMessage state={state} />
      <form action={action} className="flex flex-wrap gap-2">
        <button name="status" value="completed" className="btn-primary">
          Mark completed
        </button>
        <button name="status" value="student_absent" className="btn-secondary">
          Student absent
        </button>
        {isAdmin && (
          <button name="status" value="teacher_absent" className="btn-secondary">
            Teacher absent
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={() => setMode(mode === "reschedule" ? "none" : "reschedule")}>
          Reschedule
        </button>
        <button type="button" className="btn-danger" onClick={() => setMode(mode === "cancel" ? "none" : "cancel")}>
          Cancel class
        </button>
      </form>

      {mode === "cancel" && (
        <form action={action} className="space-y-2 rounded-lg border border-red-100 bg-red-50/40 p-3">
          <input type="hidden" name="status" value="cancelled" />
          <label className="label" htmlFor="reason">Reason for cancelling</label>
          <input className="input" id="reason" name="reason" required placeholder="e.g. Student requested, holiday" />
          <SubmitButton className="btn-danger" pendingText="Cancelling…">
            Confirm cancellation
          </SubmitButton>
        </form>
      )}

      {mode === "reschedule" && (
        <form action={rAction} className="space-y-2 rounded-lg border border-border p-3">
          <FormMessage state={rState} />
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="r-date">New date</label>
              <input className="input" id="r-date" name="date" type="date" defaultValue={defaultDate} required />
            </div>
            <div>
              <label className="label" htmlFor="r-time">New start time ({tzLabel})</label>
              <input className="input" id="r-time" name="time" type="time" defaultValue={defaultTime} required />
            </div>
          </div>
          <input className="input" name="reason" placeholder="Reason (optional)" aria-label="Reason" />
          <SubmitButton pendingText="Rescheduling…">Move class</SubmitButton>
        </form>
      )}
    </div>
  );
}
