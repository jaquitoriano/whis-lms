import Link from "@/components/Link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RichText } from "@/components/RichText";
import { SubmitButton } from "@/components/SubmitButton";
import { EmptyState } from "@/components/ui";
import { getProgress } from "@/lib/progress";
import { deleteIeltsResult, saveIeltsGoal, saveIeltsResult, startReport } from "@/lib/progress-actions";
import {
  IELTS_KIND_LABEL,
  IELTS_MODULE_LABEL,
  IELTS_SKILLS,
  SKILLS,
  cefrDescription,
  cefrLabel,
  fmtBand,
  formatPeriod,
  formatPlainDate,
  type ProgressReport,
} from "@/lib/progress-shared";
import { todayStr } from "@/lib/time";
import type { Profile } from "@/lib/types";
import { GoalForm } from "./GoalForm";
import { IeltsForm } from "./IeltsForm";
import { SkillChange } from "./SkillChange";
import { TrendChart } from "./TrendChart";

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function ReportBody({ report, previous }: { report: ProgressReport; previous?: ProgressReport | null }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <SkillChange report={report} previous={previous} />
      <div className="space-y-4">
        {report.summary && <RichText text={report.summary} />}
        {report.strengths && (
          <div>
            <h4 className="mb-1 text-sm font-medium">Strengths</h4>
            <RichText text={report.strengths} />
          </div>
        )}
        {report.next_goals && (
          <div>
            <h4 className="mb-1 text-sm font-medium">Goals for the next period</h4>
            <RichText text={report.next_goals} />
          </div>
        )}
      </div>
    </div>
  );
}

// A student's progress (PRG-01..03): latest report against the previous one, levels over time,
// IELTS results with the overall band and target, and the report history. Used by all three
// portals; what each viewer gets is decided by the database.
export async function ProgressView({
  supabase,
  viewer,
  student,
  isIelts,
  editResult,
  notice,
}: {
  supabase: SupabaseClient;
  viewer: Profile;
  student: Pick<Profile, "id" | "full_name">;
  isIelts: boolean;
  editResult?: string;
  notice?: { ok?: string; error?: string };
}) {
  const { reports, results, goal } = await getProgress(supabase, student.id);
  const tz = viewer.timezone;
  const isStudent = viewer.role === "student";
  const canWrite = !isStudent;
  const base = `/${viewer.role}/progress/${student.id}`;
  const published = reports.filter((r) => r.status === "published");
  // Only the viewer's own drafts (a teacher never receives anyone else's).
  const drafts = reports.filter((r) => r.status === "draft" && r.author_id === viewer.id);
  const [latest, previous] = published;
  const fullResults = results.filter((r) => r.overall !== null);
  const latestBand = fullResults[0];
  const showIelts = isIelts || results.length > 0;
  const editing = editResult ? results.find((r) => r.id === editResult) : null;
  const canChange = (recordedBy: string | null) => viewer.role === "admin" || (viewer.role === "teacher" && recordedBy === viewer.id);
  const today = todayStr(tz);
  const weeksToExam = goal?.exam_date ? Math.ceil((Date.parse(`${goal.exam_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / (7 * 86400000)) : null;
  const ascending = <T,>(rows: T[]) => [...rows].reverse();

  return (
    <div className="space-y-6">
      {notice?.ok && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice.ok}</p>}
      {notice?.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {notice.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Current level" value={latest ? cefrLabel(latest.overall) : "—"} sub={latest ? cefrDescription(latest.overall) : "No report yet"} />
        <Tile label="Last report" value={latest ? formatPlainDate(latest.period_end) : "—"} sub={latest ? `by ${latest.author?.full_name ?? (isStudent ? "your teacher" : "a previous teacher")}` : undefined} />
        {showIelts ? (
          <>
            <Tile
              label="Latest IELTS band"
              value={latestBand ? fmtBand(latestBand.overall) : "—"}
              sub={latestBand ? `${IELTS_KIND_LABEL[latestBand.kind]}, ${formatPlainDate(latestBand.test_date)}` : "No full test yet"}
            />
            <Tile
              label="Target band"
              value={goal?.target_overall != null ? fmtBand(goal.target_overall) : "—"}
              sub={
                goal?.exam_date
                  ? `Exam ${formatPlainDate(goal.exam_date)}${weeksToExam !== null && weeksToExam >= 0 ? ` · ${weeksToExam} week${weeksToExam === 1 ? "" : "s"} to go` : ""}`
                  : "No exam date set"
              }
            />
          </>
        ) : (
          <>
            <Tile label="Reports" value={published.length} />
            <Tile label="Skills rated" value={latest ? SKILLS.filter((s) => latest[s.key] !== null).length : "—"} sub="in the last report" />
          </>
        )}
      </div>

      {canWrite && (
        <section className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Progress report</h2>
            <p className="text-sm text-muted">
              {drafts.length
                ? `You have a draft for ${formatPeriod(drafts[0].period_start, drafts[0].period_end)}. The student can't see it until you publish it.`
                : "Write one each month or after a series of lessons. It starts from the last report's levels."}
            </p>
          </div>
          {drafts.length ? (
            <Link href={`/${viewer.role}/progress/reports/${drafts[0].id}`} className="btn-primary">
              Continue draft
            </Link>
          ) : (
            <form action={startReport.bind(null, student.id)}>
              <SubmitButton pendingText="Starting…">Write progress report</SubmitButton>
            </form>
          )}
        </section>
      )}

      <section className="card scroll-mt-20" id={latest ? `r-${latest.id}` : undefined}>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{latest ? `Latest report: ${formatPeriod(latest.period_start, latest.period_end)}` : "Progress report"}</h2>
          {latest && canWrite && (viewer.role === "admin" || latest.author_id === viewer.id) && (
            <Link href={`/${viewer.role}/progress/reports/${latest.id}`} className="text-sm text-brand-700 hover:underline">
              Correct this report
            </Link>
          )}
        </div>
        {latest ? (
          <ReportBody report={latest} previous={previous} />
        ) : (
          <p className="text-sm text-muted">{isStudent ? "Your teacher writes a progress report every month or so. It will appear here." : "No published report yet."}</p>
        )}
      </section>

      {published.length >= 2 && (
        <section className="card">
          <h2 className="font-semibold">Overall level over time</h2>
          <p className="mb-3 text-sm text-muted">From each published report, CEFR scale.</p>
          <TrendChart
            scale="cefr"
            label="Overall level"
            points={ascending(published)
              .filter((r) => r.overall !== null)
              .map((r) => ({ date: r.period_end, value: Number(r.overall), note: formatPeriod(r.period_start, r.period_end) }))}
          />
        </section>
      )}

      {showIelts && (
        <section id="ielts" className="scroll-mt-20 space-y-4">
          <h2 className="text-lg font-semibold">IELTS results</h2>
          {fullResults.length > 0 ? (
            <div className="card">
              <h3 className="font-semibold">Overall band</h3>
              <p className="mb-3 text-sm text-muted">
                Every full test{goal?.target_overall != null ? `, with the target of ${fmtBand(goal.target_overall)}` : ""}.
              </p>
              <TrendChart
                scale="band"
                label="Overall IELTS band"
                target={goal?.target_overall != null ? Number(goal.target_overall) : null}
                points={ascending(fullResults).map((r) => ({ date: r.test_date, value: Number(r.overall), note: IELTS_KIND_LABEL[r.kind] }))}
              />
            </div>
          ) : (
            <EmptyState>{results.length ? "No full four-skill test yet, so there's no overall band to chart." : "No IELTS results yet."}</EmptyState>
          )}

          {results.length >= 2 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {IELTS_SKILLS.map((s) => {
                const pts = ascending(results)
                  .filter((r) => r[s.key] !== null)
                  .map((r) => ({ date: r.test_date, value: Number(r[s.key]), note: IELTS_KIND_LABEL[r.kind] }));
                return (
                  <div key={s.key} className="card">
                    <h3 className="mb-2 text-sm font-semibold">{s.label}</h3>
                    {pts.length ? <TrendChart compact height={130} scale="band" label={`${s.label} band`} points={pts} /> : <p className="text-sm text-muted">No results yet.</p>}
                  </div>
                );
              })}
            </div>
          )}

          {results.length > 0 && (
            // `relative` keeps the screen-reader-only header inside the scroll box on phones.
            <div className="relative overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Test</th>
                    {IELTS_SKILLS.map((s) => (
                      <th key={s.key} className="px-3 py-3 text-right font-medium" title={s.label}>
                        <span className="sm:hidden">{s.short}</span>
                        <span className="hidden sm:inline">{s.label}</span>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right font-medium">Overall</th>
                    {canWrite && (
                      <th className="px-4 py-3 font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {results.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-3">{formatPlainDate(r.test_date)}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium">{IELTS_KIND_LABEL[r.kind]}</span>
                        <span className="block text-xs text-muted">{IELTS_MODULE_LABEL[r.module]}</span>
                        {r.notes && <span className="mt-1 block text-xs text-muted">{r.notes}</span>}
                      </td>
                      {IELTS_SKILLS.map((s) => (
                        <td key={s.key} className="px-3 py-3 text-right tabular-nums">
                          {fmtBand(r[s.key])}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmtBand(r.overall)}</td>
                      {canWrite && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {canChange(r.recorded_by) && (
                            <span className="inline-flex gap-3">
                              <Link href={`${base}?edit=${r.id}#ielts-form`} className="text-brand-700 hover:underline">
                                Edit
                              </Link>
                              <form action={deleteIeltsResult.bind(null, student.id, r.id)}>
                                <button type="submit" className="text-red-700 hover:underline">
                                  Delete
                                </button>
                              </form>
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canWrite && (
            <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
              <section id="ielts-form" className="card scroll-mt-20">
                <h3 className="mb-3 font-semibold">{editing ? `Correct the ${formatPlainDate(editing.test_date)} result` : "Add a result"}</h3>
                <IeltsForm
                  key={editing?.id ?? "new"}
                  action={saveIeltsResult.bind(null, student.id)}
                  initial={editing}
                  today={today}
                  cancelHref={editing ? `${base}#ielts` : undefined}
                />
              </section>
              <section className="card">
                <h3 className="mb-3 font-semibold">Target</h3>
                <GoalForm goal={goal} action={saveIeltsGoal.bind(null, student.id)} />
              </section>
            </div>
          )}
        </section>
      )}

      {published.length > 1 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Earlier reports</h2>
          <div className="space-y-3">
            {published.slice(1).map((r, i) => (
              <details key={r.id} id={`r-${r.id}`} className="card group scroll-mt-20">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{formatPeriod(r.period_start, r.period_end)}</span>
                  <span className="text-sm text-muted">
                    Overall <strong className="text-foreground">{cefrLabel(r.overall)}</strong>
                    {r.author?.full_name ? ` · ${r.author.full_name}` : ""}
                    <span className="ml-2 text-brand-700 group-open:hidden">Show</span>
                  </span>
                </summary>
                <div className="mt-4">
                  <ReportBody report={r} previous={published[i + 2]} />
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
      <p className="text-xs text-muted">Levels use the CEFR scale, from A1 (beginner) to C2 (proficient). IELTS bands run from 0 to 9.</p>
    </div>
  );
}
