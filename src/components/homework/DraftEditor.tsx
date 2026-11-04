"use client";

import { useActionState } from "react";
import { saveDraftAnswer, submitHomework } from "@/lib/homework-actions";
import { wordCount } from "@/lib/homework-shared";
import { FORMAT_HINT } from "@/components/RichText";
import { FormMessage } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { useAutosave } from "./useAutosave";

// Student answer box with autosave and word count (HW-S10), and the Submit step (HW-S13).
export function DraftEditor({
  assignmentId,
  submissionId,
  answer,
  updatedAt,
  fileCount,
  isLate,
  version,
}: {
  assignmentId: string;
  submissionId: string;
  answer: string;
  updatedAt: string;
  fileCount: number;
  isLate: boolean;
  version: number;
}) {
  const { values, update, flush, statusText, status } = useAutosave(
    { answer_text: answer },
    answer ? updatedAt : null,
    async (p: Partial<{ answer_text: string }>): Promise<{ ok: boolean; savedAt?: string }> =>
      saveDraftAnswer(assignmentId, submissionId, p.answer_text ?? ""),
  );
  const [state, action] = useActionState(submitHomework.bind(null, assignmentId), {});
  const words = wordCount(values.answer_text);
  const empty = !values.answer_text.trim() && fileCount === 0;

  return (
    <form
      action={action}
      className="space-y-3"
      onSubmit={(e) => {
        const msg = `Submit ${version > 1 ? `version ${version}` : "your homework"}${isLate ? " (after the deadline)" : ""}? You won't be able to change it afterwards.`;
        if (!window.confirm(msg)) e.preventDefault();
      }}
    >
      <FormMessage state={state} />
      <input type="hidden" name="submission_id" value={submissionId} />
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="label mb-0" htmlFor="answer_text">
            Your answer
          </label>
          <span className="text-xs text-muted" aria-live="polite">
            {words} {words === 1 ? "word" : "words"} · <span className={status === "error" ? "text-red-700" : ""}>{statusText}</span>
          </span>
        </div>
        <textarea
          id="answer_text"
          name="answer_text"
          className="input min-h-56 font-[inherit] leading-relaxed"
          value={values.answer_text}
          onChange={(e) => update("answer_text", e.target.value)}
          onBlur={() => void flush()}
          maxLength={50000}
          placeholder="Type your answer here, or upload files below."
        />
        <p className="mt-1 text-xs text-muted">{FORMAT_HINT}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Submitting…">{version > 1 ? `Submit version ${version}` : "Submit homework"}</SubmitButton>
        {empty && <span className="text-xs text-muted">Add an answer or a file to submit.</span>}
        {isLate && <span className="text-xs text-amber-700">The deadline has passed. Your work will be marked late.</span>}
      </div>
    </form>
  );
}
