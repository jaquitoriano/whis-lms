import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader } from "@/components/ui";
import { addBlackout, deleteBlackout, saveAvailability } from "@/lib/session-actions";
import { formatDateTime, todayStr, tzLabel } from "@/lib/time";

export const metadata = { title: "Available hours" };

const DAYS = [1, 2, 3, 4, 5, 6, 0];
const NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function AvailabilityPage() {
  const { supabase, profile } = await requireRole("teacher");
  const [{ data: av }, { data: bl }] = await Promise.all([
    supabase.from("teacher_availability").select("*").eq("teacher_id", profile.id),
    supabase.from("teacher_blackouts").select("*").eq("teacher_id", profile.id).gt("ends_at", new Date().toISOString()).order("starts_at"),
  ]);
  const byDay = new Map((av ?? []).map((a) => [a.weekday as number, a]));

  return (
    <>
      <PageHeader title="Available hours" description={`Times are in your time zone: ${tzLabel(profile.timezone)}. Classes outside these hours need a confirmation.`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-4 font-semibold">Weekly teaching hours</h2>
          <ActionForm action={saveAvailability} submitLabel="Save hours">
            <div className="space-y-2">
              {DAYS.map((d) => {
                const a = byDay.get(d);
                return (
                  <div key={d} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 sm:grid-cols-[8rem_auto_auto]">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name={`on_${d}`} defaultChecked={!!a} /> {NAMES[d]}
                    </label>
                    <input className="input w-28" type="time" name={`start_${d}`} defaultValue={a?.start_time?.slice(0, 5) ?? "09:00"} aria-label={`${NAMES[d]} start`} />
                    <input className="input w-28" type="time" name={`end_${d}`} defaultValue={a?.end_time?.slice(0, 5) ?? "18:00"} aria-label={`${NAMES[d]} end`} />
                  </div>
                );
              })}
            </div>
          </ActionForm>
        </section>

        <section className="card">
          <h2 className="mb-4 font-semibold">Block dates and times</h2>
          {(bl ?? []).length > 0 && (
            <ul className="mb-4 divide-y divide-border text-sm">
              {(bl ?? []).map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {formatDateTime(b.starts_at, profile.timezone)} – {formatDateTime(b.ends_at, profile.timezone)}
                    {b.reason && <span className="block text-muted">{b.reason}</span>}
                  </span>
                  <form action={deleteBlackout.bind(null, b.id)}>
                    <SubmitButton className="btn-danger px-2 py-1 text-xs" pendingText="…">
                      Remove
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={addBlackout} submitLabel="Block time" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="from_date">From</label>
                <input className="input" id="from_date" name="from_date" type="date" defaultValue={todayStr(profile.timezone)} required />
              </div>
              <div>
                <label className="label" htmlFor="to_date">To</label>
                <input className="input" id="to_date" name="to_date" type="date" />
              </div>
              <div>
                <label className="label" htmlFor="from_time">Start time</label>
                <input className="input" id="from_time" name="from_time" type="time" />
              </div>
              <div>
                <label className="label" htmlFor="to_time">End time</label>
                <input className="input" id="to_time" name="to_time" type="time" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="all_day" defaultChecked /> Whole days
            </label>
            <input className="input" name="reason" placeholder="Reason (e.g. holiday, training)" aria-label="Reason" />
          </ActionForm>
        </section>
      </div>
    </>
  );
}
