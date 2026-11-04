import { ActionForm } from "@/components/ActionForm";
import { createClasses } from "@/lib/session-actions";
import { tzLabel } from "@/lib/time";

export type Pair = { teacher_id: string; student_id: string; label: string; course_id: string | null; duration: number };

// Used by teachers (their own students) and admins (any active teacher–student pair).
export function NewClassForm({ pairs, date, tz, courses }: { pairs: Pair[]; date: string; tz: string; courses: { id: string; name: string }[] }) {
  if (pairs.length === 0) return <p className="card text-sm text-muted">There are no teacher–student assignments yet. Assign a teacher to a student first.</p>;
  return (
    <div className="card max-w-2xl">
      <ActionForm action={createClasses} submitLabel="Schedule" pendingText="Scheduling…">
        <div>
          <label className="label" htmlFor="pair">Student</label>
          <select className="input" id="pair" name="pair" required defaultValue={pairs.length === 1 ? `${pairs[0].teacher_id}|${pairs[0].student_id}` : ""}>
            <option value="" disabled>
              Choose…
            </option>
            {pairs.map((p) => (
              <option key={`${p.teacher_id}|${p.student_id}`} value={`${p.teacher_id}|${p.student_id}`}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="date">Date</label>
            <input className="input" id="date" name="date" type="date" defaultValue={date} required />
          </div>
          <div>
            <label className="label" htmlFor="time">Start time</label>
            <input className="input" id="time" name="time" type="time" defaultValue="10:00" step={300} required />
            <p className="mt-1 text-xs text-muted">{tzLabel(tz)}</p>
          </div>
          <div>
            <label className="label" htmlFor="duration">Length (minutes)</label>
            <input className="input" id="duration" name="duration" type="number" min={15} max={240} step={5} defaultValue={50} required />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="course_id">Course</label>
            <select className="input" id="course_id" name="course_id" defaultValue="">
              <option value="">Student&apos;s enrolled course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="repeat_weeks">Repeat weekly</label>
            <select className="input" id="repeat_weeks" name="repeat_weeks" defaultValue="1">
              <option value="1">Just once</option>
              {[2, 4, 8, 12, 16, 26].map((n) => (
                <option key={n} value={n}>
                  {n} weeks
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="meeting_url">Meeting link (Zoom, Google Meet…)</label>
          <input className="input" id="meeting_url" name="meeting_url" type="url" placeholder="https://" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="override" /> Schedule anyway if outside the teacher&apos;s available hours
        </label>
      </ActionForm>
    </div>
  );
}
