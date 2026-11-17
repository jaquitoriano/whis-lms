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
  const [mode, setMode] = useState<"none" | "reschedule" | "late_with" | "late_without">("none");
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
        <button type="button" className="btn-secondary" onClick={() => setMode(mode === "late_with" ? "none" : "late_with")}>
          Student late with notice
        </button>
        <button type="button" className="btn-secondary" onClick={() => setMode(mode === "late_without" ? "none" : "late_without")}>
          Student late without notice
        </button>
        <button name="status" value="student_absent_with" className="btn-secondary">
          Student absent with notice
        </button>
        <button name="status" value="student_absent_without" className="btn-secondary">
          Student absent without notice
        </button>
        {isAdmin && (
          <button name="status" value="teacher_absent" className="btn-secondary">
            Teacher absent
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={() => setMode(mode === "reschedule" ? "none" : "reschedule")}>
          Reschedule
        </button>
      </form>

      {(mode === "late_with" || mode === "late_without") && (
        <form key={mode} action={action} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
          <input type="hidden" name="status" value="completed" />
          <input type="hidden" name="attendance" value="late" />
          <input type="hidden" name="notice" value={mode === "late_with" ? "with" : "without"} />
          <div>
            <label className="label" htmlFor="minutes_late">Minutes late</label>
            <input className="input w-28" id="minutes_late" name="minutes_late" type="number" min={1} max={240} defaultValue={10} required />
          </div>
          <SubmitButton pendingText="Saving…">{mode === "late_with" ? "Save: late with notice" : "Save: late without notice"}</SubmitButton>
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
