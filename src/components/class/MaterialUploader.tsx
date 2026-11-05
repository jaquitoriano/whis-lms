"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadWithProgress } from "@/lib/upload";
import { registerMaterialFile } from "@/lib/session-actions";

const MAX = 25 * 1024 * 1024;
const ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.gif,.mp3,.m4a";

// Uploads go straight from the browser to private storage (so large files don't pass
// through the web server), then the server records the material against the class.
export function MaterialUploader({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return setMsg({ ok: false, text: "Choose a file first." });
    if (file.size > MAX) return setMsg({ ok: false, text: "Files must be 25 MB or smaller." });

    setBusy(true);
    setPercent(0);
    setMsg(null);
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-100);
    const path = `${sessionId}/${crypto.randomUUID()}-${safe}`;
    const up = await uploadWithProgress("materials", path, file, setPercent);
    if (up.error) {
      setBusy(false);
      return setMsg({ ok: false, text: up.error.includes("mime") ? "That file type isn't allowed." : "Upload failed. Please try again." });
    }
    const r = await registerMaterialFile(sessionId, {
      path,
      name: file.name,
      type: file.type,
      size: file.size,
      title: String(fd.get("title") ?? "").trim(),
      unit_chapter: String(fd.get("unit_chapter") ?? "").trim(),
      pages: String(fd.get("pages") ?? "").trim(),
    });
    setBusy(false);
    setMsg({ ok: !r.error, text: r.error ?? "File uploaded." });
    if (!r.error) {
      form.current?.reset();
      router.refresh();
    }
  }

  return (
    <form ref={form} onSubmit={onSubmit} className="space-y-3">
      {msg && <p role={msg.ok ? undefined : "alert"} className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
      <input type="file" name="file" accept={ACCEPT} required className="block w-full text-sm" aria-label="File" />
      <div className="grid gap-2 sm:grid-cols-3">
        <input className="input" name="title" placeholder="Title (book or handout)" aria-label="Title" />
        <input className="input" name="unit_chapter" placeholder="Unit / chapter" aria-label="Unit or chapter" />
        <input className="input" name="pages" placeholder="Pages" aria-label="Pages" />
      </div>
      <p className="text-xs text-muted">PDF, Word, PowerPoint, images or audio, up to 25 MB.</p>
      {busy && <progress className="block h-2 w-full max-w-sm accent-brand-600" value={percent} max={100} aria-label="Upload progress" />}
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? `Uploading… ${percent}%` : "Upload file"}
      </button>
    </form>
  );
}
