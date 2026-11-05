import Link from "@/components/Link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ActionForm } from "@/components/ActionForm";
import { RichText } from "@/components/RichText";
import { SubmitButton } from "@/components/SubmitButton";
import { DraftEditor } from "./DraftEditor";
import { FileList } from "./FileList";
import { HomeworkForm } from "./HomeworkForm";
import { HomeworkStatusBadges } from "./HomeworkTable";
import { HomeworkUploader } from "./HomeworkUploader";
import { ReviewEditor } from "./ReviewEditor";
import { getHomeworkDetail } from "@/lib/homework";
import type { Submission } from "@/lib/homework-shared";
import { addReferenceLink, deleteHomework } from "@/lib/homework-actions";
import { formatDateTime, tzLabel } from "@/lib/time";
import type { Profile } from "@/lib/types";

// One homework assignment, for every role:
// - teacher who set it: edit, files, review the latest submission
// - student: instructions, current draft + submit, full history with sent feedback
// - admin and the student's other teachers: read-only (HW-S25, HW-S24)
export async function HomeworkDetail({
  supabase,
  viewer,
  id,
  flash,
}: {
  supabase: SupabaseClient;
  viewer: Profile;
  id: string;
  flash?: string;
}) {
  const detail = await getHomeworkDetail(supabase, id);
  if (!detail) notFound();

  const isOwner = viewer.role === "teacher" && detail.homework.teacher_id === viewer.id;
  const isStudent = viewer.role === "student";
  const tz = viewer.timezone;

  // Note: Next.js memoises identical GET requests within one render, so after these
  // writes we patch the loaded data instead of re-running the same queries.
  // HW-S17: the teacher opening a new submission moves it to Under Review.
  if (isOwner && detail.homework.status === "submitted") {
    const { error } = await supabase.rpc("start_homework_review", { p_assignment: id });
    if (!error) detail.homework.status = "under_review";
  }
  // The student's working copy: created on first visit while the homework is open.
  const open = detail.homework.status === "assigned" || detail.homework.status === "needs_revision";
  if (isStudent && open && !detail.submissions.some((s) => s.is_draft)) {
    const { data: draftId } = await supabase.rpc("open_homework_draft", { p_assignment: id });
    if (draftId) {
      const { data: fresh } = await supabase.from("homework_submissions").select("*").eq("id", draftId as string).maybeSingle();
      if (fresh) detail.submissions.push(fresh as Submission);
    }
  }

  const { homework: h, submissions, reviews, files } = detail;
  const submitted = submissions.filter((s) => !s.is_draft).sort((a, b) => b.version - a.version);
  const draft = submissions.find((s) => s.is_draft);
  const latest = submitted[0];
  const references = files.filter((f) => f.kind === "reference");
  const filesOf = (submissionId: string, kind: "submission" | "correction") => files.filter((f) => f.submission_id === submissionId && f.kind === kind);
  const reviewOf = (submissionId: string) => reviews.find((r) => r.submission_id === submissionId);
  const canReview = isOwner && latest && (h.status === "under_review" || h.status === "submitted") && !reviewOf(latest.id)?.sent_at;

  return (
    <div className="space-y-6">
      <Link href={`/${viewer.role}/homework`} className="inline-block text-sm text-muted hover:text-foreground">
        ← All homework
      </Link>

      {flash === "submitted" && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Submitted. Your teacher will review it and you&apos;ll see their feedback here.</p>}
      {flash === "completed" && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Marked completed. The student can now see your feedback.</p>}
      {flash === "needs_revision" && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Sent back for revision. The student can now see your feedback and submit a new version.</p>}
      {flash === "created" && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Homework assigned. Add worksheets or reference files below if needed.</p>}

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{h.title}</h1>
            <p className="mt-1 text-sm text-muted">
              {isStudent ? `From ${h.teacher?.full_name}` : `For ${h.student?.full_name} · set by ${h.teacher?.full_name}`}
              {h.session_id && (
                <>
                  {" · "}
                  <Link href={`/${viewer.role}/classes/${h.session_id}`} className="text-brand-700 hover:underline">
                    from this class
                  </Link>
                </>
              )}
            </p>
          </div>
          <HomeworkStatusBadges h={h} />
        </div>
        <p className="mt-3 text-sm">
          <span className="text-muted">Due </span>
          <span className="font-medium">{formatDateTime(h.due_at, tz, { year: "numeric" })}</span>
          <span className="text-muted"> ({tzLabel(tz)})</span>
        </p>
        {h.requirements && (
          <p className="mt-1 text-sm">
            <span className="text-muted">Requirements: </span>
            {h.requirements}
          </p>
        )}
        {h.instructions && <RichText text={h.instructions} className="mt-4 rounded-lg bg-background p-4" />}

        {(references.length > 0 || isOwner) && (
          <div className="mt-4 border-t border-border pt-4">
            <h2 className="mb-2 text-sm font-semibold">Reference materials</h2>
            <FileList files={references} assignmentId={id} canDelete={isOwner} empty="None attached." />
            {isOwner && (
              <div className="mt-3 flex flex-wrap items-start gap-6">
                <HomeworkUploader assignmentId={id} submissionId={null} kind="reference" label="Upload reference files" />
                <ActionForm action={addReferenceLink.bind(null, id)} submitLabel="Add link" resetOnSuccess className="flex flex-wrap items-start gap-2">
                  <input className="input w-48" name="title" placeholder="Link title" aria-label="Link title" />
                  <input className="input w-64" name="url" type="url" placeholder="https://…" aria-label="Link URL" required />
                </ActionForm>
              </div>
            )}
          </div>
        )}

        {isOwner && (
          <details className="mt-4 border-t border-border pt-4">
            <summary className="cursor-pointer text-sm font-medium text-brand-700">{submitted.length ? "Change deadline" : "Edit or withdraw"}</summary>
            <div className="mt-4 max-w-2xl space-y-4">
              <HomeworkForm tz={tz} defaultDue={new Date(h.due_at)} existing={h} deadlineOnly={submitted.length > 0} />
              {submitted.length === 0 && (
                <form action={deleteHomework.bind(null, id)}>
                  <SubmitButton className="btn-danger" pendingText="Withdrawing…">
                    Withdraw homework
                  </SubmitButton>
                </form>
              )}
            </div>
          </details>
        )}
      </section>

      {isStudent && draft && open && (
        <section className="card border-brand-100">
          <h2 className="mb-1 font-semibold">{draft.version > 1 ? `Your revision (version ${draft.version})` : "Your work"}</h2>
          {h.status === "needs_revision" && <p className="mb-3 text-sm text-amber-700">Your teacher asked for changes. Read their feedback below, then submit a new version.</p>}
          <DraftEditor
            assignmentId={id}
            submissionId={draft.id}
            answer={draft.answer_text}
            updatedAt={draft.updated_at}
            fileCount={filesOf(draft.id, "submission").length}
            isLate={Date.parse(h.due_at) < Date.now()}
            version={draft.version}
          />
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="mb-2 text-sm font-semibold">Attached files</h3>
            <FileList files={filesOf(draft.id, "submission")} assignmentId={id} submissionId={draft.id} canDelete canReorder empty="No files yet." />
            <div className="mt-3">
              <HomeworkUploader
                assignmentId={id}
                submissionId={draft.id}
                kind="submission"
                label="Add files or photos"
                hint="Documents, photos of handwritten work (iPhone photos are converted automatically), or audio. Up to 25 MB each."
              />
            </div>
          </div>
        </section>
      )}

      {canReview && (
        <section className="card border-violet-200">
          <h2 className="mb-1 font-semibold">Review version {latest.version}</h2>
          <p className="mb-4 text-sm text-muted">
            Submitted {formatDateTime(latest.submitted_at!, tz)}
            {latest.is_late && <span className="badge ml-2 bg-amber-50 text-amber-700">Late</span>}
          </p>
          <ReviewEditor
            assignmentId={id}
            submissionId={latest.id}
            comments={reviewOf(latest.id)?.comments ?? ""}
            corrections={reviewOf(latest.id)?.corrections ?? ""}
            updatedAt={reviewOf(latest.id)?.updated_at ?? null}
          />
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="mb-2 text-sm font-semibold">Corrected files</h3>
            <FileList files={filesOf(latest.id, "correction")} assignmentId={id} canDelete />
            <div className="mt-2">
              <HomeworkUploader assignmentId={id} submissionId={latest.id} kind="correction" label="Upload corrected file" hint="E.g. the student's essay with your mark-up. Shown to the student with your feedback." />
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">{submitted.length ? "Submission history" : "Submissions"}</h2>
        {submitted.length === 0 ? (
          <p className="card text-sm text-muted">{isStudent ? "You haven't submitted this homework yet." : "Not submitted yet."}</p>
        ) : (
          <div className="space-y-4">
            {submitted.map((s) => {
              const r = reviewOf(s.id);
              const visibleReview = r && (r.sent_at || !isStudent) ? r : null;
              return (
                <article key={s.id} className="card">
                  <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-medium">Version {s.version}</h3>
                    <span className="text-xs text-muted">
                      Submitted {formatDateTime(s.submitted_at!, tz)}
                      {s.is_late && <span className="badge ml-2 bg-amber-50 text-amber-700">Late</span>}
                    </span>
                  </header>
                  {s.answer_text ? <RichText text={s.answer_text} className="rounded-lg bg-background p-4" /> : <p className="text-sm text-muted">No typed answer.</p>}
                  <div className="mt-3">
                    <FileList files={filesOf(s.id, "submission")} assignmentId={id} />
                  </div>
                  {visibleReview && (visibleReview.sent_at || visibleReview.comments || visibleReview.corrections) && (
                    <div className="mt-4 rounded-lg border border-border p-4">
                      <p className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium">
                        Teacher feedback
                        {visibleReview.decision === "completed" && <span className="badge bg-green-50 text-green-700">Completed</span>}
                        {visibleReview.decision === "needs_revision" && <span className="badge bg-amber-50 text-amber-700">Revision requested</span>}
                        {!visibleReview.sent_at && <span className="badge bg-slate-100 text-slate-600">Draft, not sent</span>}
                      </p>
                      <RichText text={visibleReview.comments} />
                      {visibleReview.corrections && (
                        <div className="mt-3">
                          <p className="text-xs font-medium uppercase text-muted">Corrections</p>
                          <RichText text={visibleReview.corrections} className="font-mono text-[13px]" />
                        </div>
                      )}
                      <div className="mt-3">
                        <FileList files={filesOf(s.id, "correction")} assignmentId={id} />
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
