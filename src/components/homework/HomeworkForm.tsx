import { ActionForm } from "@/components/ActionForm";
import { FORMAT_HINT } from "@/components/RichText";
import { createHomework, updateHomework } from "@/lib/homework-actions";
import { toDateStr, toTimeStr, tzLabel } from "@/lib/time";
import type { Homework } from "@/lib/homework-shared";

type Student = { id: string; label: string };
type Material = { id: string; title: string; kind: "file" | "link" };

// Create (with student + optional class) or edit an assignment. After a submission
// exists, only the deadline is editable (HW-S07).
export function HomeworkForm({
  tz,
  students,
  sessionId,
  materials = [],
  defaultStudent,
  defaultDue,
  existing,
  deadlineOnly = false,
}: {
  tz: string;
  students?: Student[];
  sessionId?: string | null;
  materials?: Material[];
  defaultStudent?: string;
  defaultDue: Date;
  existing?: Homework;
  deadlineOnly?: boolean;
}) {
  const due = existing ? new Date(existing.due_at) : defaultDue;
  const deadline = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="due_date">Deadline</label>
        <input className="input" id="due_date" name="due_date" type="date" defaultValue={toDateStr(due, tz)} required />
      </div>
      <div>
        <label className="label" htmlFor="due_time">Time ({tzLabel(tz)})</label>
        <input className="input" id="due_time" name="due_time" type="time" defaultValue={existing ? toTimeStr(due, tz) : "23:59"} required />
      </div>
    </div>
  );

  if (existing && deadlineOnly) {
    return (
      <ActionForm action={updateHomework.bind(null, existing.id)} submitLabel="Change deadline">
        <input type="hidden" name="deadline_only" value="1" />
        {deadline}
      </ActionForm>
    );
  }

  return (
    <ActionForm action={existing ? updateHomework.bind(null, existing.id) : createHomework} submitLabel={existing ? "Save changes" : "Assign homework"} pendingText="Saving…">
      {!existing && (
        <>
          <input type="hidden" name="session_id" value={sessionId ?? ""} />
          {students && students.length > 1 ? (
            <div>
              <label className="label" htmlFor="student_id">Student</label>
              <select className="input" id="student_id" name="student_id" defaultValue={defaultStudent ?? ""} required>
                <option value="" disabled>
                  Choose…
                </option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <input type="hidden" name="student_id" value={students?.[0]?.id ?? defaultStudent ?? ""} />
              <p className="text-sm">
                For <span className="font-medium">{students?.[0]?.label}</span>
              </p>
            </>
          )}
        </>
      )}
      <div>
        <label className="label" htmlFor="title">Title</label>
        <input className="input" id="title" name="title" defaultValue={existing?.title} maxLength={200} required placeholder="e.g. Task 2 essay: technology" />
      </div>
      <div>
        <label className="label" htmlFor="instructions">Instructions</label>
        <textarea className="input min-h-40" id="instructions" name="instructions" defaultValue={existing?.instructions} maxLength={20000} />
        <p className="mt-1 text-xs text-muted">{FORMAT_HINT}</p>
      </div>
      <div>
        <label className="label" htmlFor="requirements">Requirements (optional)</label>
        <input className="input" id="requirements" name="requirements" defaultValue={existing?.requirements} maxLength={2000} placeholder="e.g. 250 words minimum, 40 minutes" />
      </div>
      {deadline}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_required" defaultChecked={existing ? existing.is_required : true} /> Required (untick for optional homework)
      </label>
      {!existing && materials.some((m) => m.kind === "link") && (
        <fieldset>
          <legend className="label">Attach links from this class</legend>
          <div className="space-y-1">
            {materials
              .filter((m) => m.kind === "link")
              .map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="material_id" value={m.id} /> {m.title}
                </label>
              ))}
          </div>
        </fieldset>
      )}
      {!existing && <p className="text-xs text-muted">You can upload worksheets and other files on the next page.</p>}
    </ActionForm>
  );
}
