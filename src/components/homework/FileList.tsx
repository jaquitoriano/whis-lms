import { SubmitButton } from "@/components/SubmitButton";
import { deleteHomeworkFile, moveSubmissionFile } from "@/lib/homework-actions";
import { fileSize, isImage, type HomeworkFile } from "@/lib/homework-shared";

export function FileList({
  files,
  assignmentId,
  canDelete = false,
  canReorder = false,
  submissionId,
  empty,
}: {
  files: HomeworkFile[];
  assignmentId: string;
  canDelete?: boolean;
  canReorder?: boolean;
  submissionId?: string;
  empty?: string;
}) {
  if (!files.length) return empty ? <p className="text-sm text-muted">{empty}</p> : null;
  const images = files.filter(isImage);
  return (
    <div className="space-y-3">
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((f, i) => (
            <figure key={f.id} className="overflow-hidden rounded-lg border border-border">
              <a href={f.signedUrl} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.signedUrl} alt={f.title || f.file_name || "Uploaded image"} className="h-40 w-full bg-slate-50 object-contain" loading="lazy" />
              </a>
              <figcaption className="flex items-center justify-between gap-1 px-2 py-1 text-xs text-muted">
                <span className="truncate">{canReorder ? `Page ${i + 1}` : f.file_name}</span>
                <span className="flex shrink-0 gap-1">
                  {canReorder && submissionId && i > 0 && (
                    <form action={moveSubmissionFile.bind(null, assignmentId, submissionId, f.id, -1)}>
                      <button className="rounded px-1 hover:bg-slate-100" aria-label="Move earlier">
                        ←
                      </button>
                    </form>
                  )}
                  {canReorder && submissionId && i < images.length - 1 && (
                    <form action={moveSubmissionFile.bind(null, assignmentId, submissionId, f.id, 1)}>
                      <button className="rounded px-1 hover:bg-slate-100" aria-label="Move later">
                        →
                      </button>
                    </form>
                  )}
                  {canDelete && (
                    <form action={deleteHomeworkFile.bind(null, assignmentId, f.id)}>
                      <button className="rounded px-1 text-red-700 hover:bg-red-50" aria-label={`Remove ${f.file_name}`}>
                        ✕
                      </button>
                    </form>
                  )}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {files.filter((f) => !isImage(f)).length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {files
            .filter((f) => !isImage(f))
            .map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <a href={f.signedUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
                    {f.title || f.file_name || f.url}
                  </a>
                  <span className="block text-xs text-muted">{f.storage_path ? `${f.file_name} ${fileSize(f.size_bytes)}` : "Link"}</span>
                </span>
                {canDelete && (
                  <form action={deleteHomeworkFile.bind(null, assignmentId, f.id)}>
                    <SubmitButton className="btn-danger px-2 py-1 text-xs" pendingText="…">
                      Remove
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
