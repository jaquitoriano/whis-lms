"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registerHomeworkFile } from "@/lib/homework-actions";
import { HOMEWORK_ACCEPT, HOMEWORK_MAX_BYTES, type FileKind } from "@/lib/homework-shared";

// iPhone photos arrive as HEIC, which most browsers can't display. Convert them to
// JPEG in the browser before upload so teachers see a normal image (HW-S12).
async function normalise(file: File): Promise<File> {
  const isHeic = /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (!isHeic) return file;
  try {
    const heic2any = (await import("heic2any")).default;
    const out = (await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 })) as Blob | Blob[];
    const blob = Array.isArray(out) ? out[0] : out;
    return new File([blob], file.name.replace(/\.hei[cf]$/i, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file; // keep the original; it can still be downloaded
  }
}

export function HomeworkUploader({
  assignmentId,
  submissionId,
  kind,
  label = "Upload files",
  hint = "PDF, Word, PowerPoint, images or audio, up to 25 MB each.",
}: {
  assignmentId: string;
  submissionId: string | null;
  kind: FileKind;
  label?: string;
  hint?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setMsg(null);
    const supabase = createClient();
    let done = 0;
    for (const original of Array.from(files)) {
      setBusy(`Uploading ${original.name}…`);
      const file = await normalise(original);
      if (file.size > HOMEWORK_MAX_BYTES) {
        setMsg({ ok: false, text: `${original.name} is larger than 25 MB.` });
        continue;
      }
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-100);
      const folder = kind === "reference" ? `${assignmentId}/reference` : `${assignmentId}/${submissionId}/${kind}`;
      const path = `${folder}/${crypto.randomUUID()}-${safe}`;
      const up = await supabase.storage.from("homework").upload(path, file, { contentType: file.type || undefined });
      if (up.error) {
        setMsg({ ok: false, text: /mime|type/i.test(up.error.message) ? `${original.name}: that file type isn't allowed.` : `${original.name}: upload failed.` });
        continue;
      }
      const r = await registerHomeworkFile({ assignmentId, submissionId, kind, path, name: file.name, type: file.type, size: file.size });
      if (r.error) setMsg({ ok: false, text: r.error });
      else done++;
    }
    setBusy(null);
    if (input.current) input.current.value = "";
    if (done) {
      setMsg((m) => m ?? { ok: true, text: done === 1 ? "File uploaded." : `${done} files uploaded.` });
      router.refresh();
    }
  }

  return (
    <div className="space-y-2">
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
      <label className={`btn-secondary cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
        {busy ?? label}
        <input
          ref={input}
          type="file"
          multiple
          accept={HOMEWORK_ACCEPT}
          className="sr-only"
          onChange={(e) => upload(e.target.files)}
          disabled={!!busy}
          aria-label={label}
        />
      </label>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}
