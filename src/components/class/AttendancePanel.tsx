import { ActionForm } from "@/components/ActionForm";
import { attendanceLabel, attendanceStyle, cancelPartyLabel, type AttendanceMark, type CancelParty } from "@/lib/billing-shared";
import { saveAttendance, setSessionBilling } from "@/lib/session-actions";

type Attendance = { mark: AttendanceMark; minutes_late: number | null; note: string } | null;

// ATT-01..02 on the class page, plus (admins only) which package the class belongs to and
// whether it used up a class (OD-04).
export function AttendancePanel({
  sessionId,
  status,
  attendance,
  canEdit,
  isAdmin,
  billing,
}: {
  sessionId: string;
  status: string;
  attendance: Attendance;
  canEdit: boolean;
  isAdmin: boolean;
  billing: {
    counts_as_used: boolean;
    late_cancel: boolean;
    cancel_requested_by: CancelParty | null;
    enrollment_id: string | null;
    enrollments: { id: string; label: string }[];
  };
}) {
  const closed = status !== "scheduled";
  const usageText = !closed
    ? "Not closed yet."
    : billing.counts_as_used
      ? billing.late_cancel
        ? "Used up a class (the student cancelled late)."
        : "Used up a class."
      : status === "cancelled" && billing.cancel_requested_by
        ? `Didn't use up a class (cancelled by ${cancelPartyLabel[billing.cancel_requested_by]}).`
        : "Didn't use up a class.";

  return (
    <section className="card">
      <h2 className="mb-3 font-semibold">Attendance</h2>
      {!attendance ? (
        <p className="text-sm text-muted">
          {closed ? "No attendance mark for this class (teacher absent)." : "Attendance is marked when the class is closed."}
        </p>
      ) : (
        <div className="space-y-1 text-sm">
          <p>
            <span className={`badge ${attendanceStyle[attendance.mark]}`}>{attendanceLabel[attendance.mark]}</span>
            {attendance.minutes_late ? <span className="ml-2 text-muted">{attendance.minutes_late} minutes late</span> : null}
          </p>
          {attendance.note && <p className="text-muted">{attendance.note}</p>}
        </div>
      )}
      <p className="mt-2 text-sm text-muted">{usageText}</p>

      {canEdit && attendance && (attendance.mark === "present" || attendance.mark === "late") && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-brand-700">Change attendance</summary>
          <ActionForm action={saveAttendance.bind(null, sessionId)} className="mt-3 space-y-3" submitLabel="Save attendance">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label" htmlFor="mark">Mark</label>
                <select className="input" id="mark" name="mark" defaultValue={attendance.mark}>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="att-minutes">Minutes late (if late)</label>
                <input className="input w-28" id="att-minutes" name="minutes_late" type="number" min={1} max={240} defaultValue={attendance.minutes_late ?? ""} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="att-note">Note (the student can see it)</label>
              <input className="input" id="att-note" name="note" defaultValue={attendance.note} maxLength={1000} />
            </div>
          </ActionForm>
        </details>
      )}

      {isAdmin && (
        <details className="mt-3 border-t border-border pt-3">
          <summary className="cursor-pointer text-sm text-brand-700">Package and class usage (admin)</summary>
          <ActionForm action={setSessionBilling.bind(null, sessionId)} className="mt-3 space-y-3" submitLabel="Save">
            <div>
              <label className="label" htmlFor="enrollment_id">Package</label>
              <select className="input" id="enrollment_id" name="enrollment_id" defaultValue={billing.enrollment_id ?? ""}>
                <option value="">Not in a package</option>
                {billing.enrollments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="counts_as_used" defaultChecked={billing.counts_as_used} /> Uses up a class from the package (and is paid to the teacher)
            </label>
            <p className="text-xs text-muted">Changing the class status works this out again. The override is recorded in the audit log.</p>
          </ActionForm>
        </details>
      )}
    </section>
  );
}
