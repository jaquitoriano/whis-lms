// Homework types and labels shared by server and client code.

export type HomeworkStatus = "assigned" | "submitted" | "under_review" | "needs_revision" | "completed";
export type FileKind = "reference" | "submission" | "correction";

export type Homework = {
  id: string;
  session_id: string | null;
  teacher_id: string;
  student_id: string;
  title: string;
  instructions: string;
  requirements: string;
  due_at: string;
  is_required: boolean;
  status: HomeworkStatus;
  created_at: string;
  teacher?: { id: string; full_name: string } | null;
  student?: { id: string; full_name: string } | null;
};

export type HomeworkFile = {
  id: string;
  assignment_id: string;
  submission_id: string | null;
  kind: FileKind;
  title: string;
  storage_path: string | null;
  url: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  position: number;
  signedUrl?: string;
};

export type Submission = {
  id: string;
  assignment_id: string;
  version: number;
  answer_text: string;
  is_draft: boolean;
  submitted_at: string | null;
  is_late: boolean;
  updated_at: string;
};

export type Review = {
  submission_id: string;
  comments: string;
  corrections: string;
  decision: "needs_revision" | "completed" | null;
  sent_at: string | null;
  updated_at: string;
};

// Student-facing and staff-facing wording differ slightly.
export const statusLabel: Record<HomeworkStatus, string> = {
  assigned: "To do",
  submitted: "Submitted",
  under_review: "Under review",
  needs_revision: "Needs revision",
  completed: "Completed",
};

export const statusStyle: Record<HomeworkStatus, string> = {
  assigned: "bg-brand-50 text-brand-700",
  submitted: "bg-violet-50 text-violet-700",
  under_review: "bg-violet-50 text-violet-700",
  needs_revision: "bg-amber-50 text-amber-700",
  completed: "bg-green-50 text-green-700",
};

// "Overdue" is shown on top of the status, not stored (suggested addition to the brief).
export function isOverdue(h: Pick<Homework, "due_at" | "status">, now = Date.now()) {
  return (h.status === "assigned" || h.status === "needs_revision") && Date.parse(h.due_at) < now;
}

export function wordCount(text: string) {
  return (text.trim().match(/\S+/g) ?? []).length;
}

export const HOMEWORK_ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.mp3,.m4a,.webm";
export const HOMEWORK_MAX_BYTES = 25 * 1024 * 1024;

export function fileSize(n: number | null) {
  if (!n) return "";
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
}

export function isImage(f: Pick<HomeworkFile, "mime_type">) {
  return !!f.mime_type && /^image\/(jpeg|png|webp|gif)$/.test(f.mime_type);
}
