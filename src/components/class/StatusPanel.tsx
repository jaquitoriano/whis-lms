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
  lateCancelHours,
  startsAt,
}: {
  sessionId: string;
  isAdmin: boolean;
  status: string;
  defaultDate: string;
  defaultTime: string;
  tzLabel: string;
  lateCancelHours: number;
  startsAt: string;
}) {
  const [state, action] = useActionState(setClassStatus.bind(null, sessionId), {});
  const [rState, rAction] = useActionState(rescheduleClass.bind(null, sessionId), {});
  const [mode, setMode] = useState<"none" | "cancel" | "reschedule" | "late">("none");
  const [requestedBy, setRequestedBy] = useState("");
  // Same rule as the database (OD-04), shown before confirming so nobody is surprised.
  // eslint-disable-next-line react-hooks/purity
  const insideCutoff = Date.parse(startsAt) - Date.now() < lateCancelHours * 3600000;

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
        <button type="button" className="btn-secondary" onClick={() => setMode(mode === "late" ? "none" : "late")}>
          Completed, student late
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

      {mode === "late" && (
        <form action={action} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
          <input type="hidden" name="status" value="completed" />
          <input type="hidden" name="attendance" value="late" />
          <div>
            <label className="label" htmlFor="minutes_late">Minutes late</label>
            <input className="input w-28" id="minutes_late" name="minutes_late" type="number" min={1} max={240} defaultValue={10} required />
          </div>
          <SubmitButton pendingText="Saving…">Mark completed (late)</SubmitButton>
        </form>
      )}

      {mode === "cancel" && (
        <form action={action} className="space-y-2 rounded-lg border border-red-100 bg-red-50/40 p-3">
          <input type="hidden" name="status" value="cancelled" />
          <fieldset>
            <legend className="label">Who asked to cancel?</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              {[
                ["student", "The student"],
                ["teacher", "The teacher"],
                ["school", "The school"],
              ].map(([v, l]) => (
                <label key={v} className="flex items-center gap-2">
                  <input type="radio" name="requested_by" value={v} required checked={requestedBy === v} onChange={() => setRequestedBy(v)} /> {l}
                </label>
              ))}
            </div>
          </fieldset>
          {requestedBy === "student" && (
            <p className={`rounded-lg px-3 py-2 text-xs ${insideCutoff ? "bg-amber-50 text-amber-800" : "bg-surface text-muted"}`}>
              {insideCutoff
                ? `This is less than ${lateCancelHours} hours before the class, so it will use up one of the student's classes. An admin can change this later.`
                : `More than ${lateCancelHours} hours before the class: it won't use up a class.`}
            </p>
          )}
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
