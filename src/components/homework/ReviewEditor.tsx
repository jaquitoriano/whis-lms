"use client";

import { useActionState } from "react";
import { saveReviewDraft, sendReview } from "@/lib/homework-actions";
import { FORMAT_HINT } from "@/components/RichText";
import { FormMessage } from "@/components/ui";
import { useAutosave } from "./useAutosave";

// Teacher feedback on the latest submission (HW-S18, S21). Autosaved as a draft the
// student can't see; becomes visible when the teacher picks an outcome.
export function ReviewEditor({
  assignmentId,
  submissionId,
  comments,
  corrections,
  updatedAt,
}: {
  assignmentId: string;
  submissionId: string;
  comments: string;
  corrections: string;
  updatedAt: string | null;
}) {
  const { values, update, flush, statusText } = useAutosave({ comments, corrections }, updatedAt, (p) =>
    saveReviewDraft(assignmentId, submissionId, p),
  );
  const [state, action] = useActionState(sendReview.bind(null, assignmentId, submissionId), {});

  if (state.ok) return <FormMessage state={state} />;

  return (
    <form action={action} className="space-y-4" onSubmit={() => void flush()}>
      <FormMessage state={state} />
      <div className="flex justify-end text-xs text-muted" aria-live="polite">
        {statusText}
      </div>
      <div>
        <label className="label" htmlFor="comments">
          Comments and suggestions
        </label>
        <textarea
          id="comments"
          name="comments"
          className="input min-h-28"
          value={values.comments}
          onChange={(e) => update("comments", e.target.value)}
          onBlur={() => void flush()}
          maxLength={20000}
          placeholder="What went well, what to improve, and why"
        />
      </div>
      <div>
        <label className="label" htmlFor="corrections">
          Corrections
        </label>
        <textarea
          id="corrections"
          name="corrections"
          className="input min-h-28 font-mono text-[13px]"
          value={values.corrections}
          onChange={(e) => update("corrections", e.target.value)}
          onBlur={() => void flush()}
          maxLength={20000}
          placeholder={'One per line, e.g.\n"I am agree" → "I agree"'}
        />
        <p className="mt-1 text-xs text-muted">{FORMAT_HINT} Use → to show a correction.</p>
      </div>
      <p className="text-xs text-muted">The student sees your feedback only after you choose an outcome.</p>
      <div className="flex flex-wrap gap-2">
        <button name="decision" value="needs_revision" className="btn-secondary">
          Request revision
        </button>
        <button name="decision" value="completed" className="btn-primary">
          Mark completed
        </button>
      </div>
    </form>
  );
}
