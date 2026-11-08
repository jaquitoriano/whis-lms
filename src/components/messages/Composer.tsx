"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { FormMessage } from "@/components/ui";
import { uploadWithProgress } from "@/lib/upload";
import { normaliseImage } from "@/lib/heic";
import { createClient } from "@/lib/supabase/client";
import type { ActionState } from "@/lib/types";

const ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.mp3,.m4a,.webm";
const MAX = 25 * 1024 * 1024;

type Attachment = { key: string; name: string; path?: string; type: string; size: number; percent: number; error?: string };

function Send({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending || disabled}>
      {pending ? "Sending…" : "Send"}
    </button>
  );
}

// Write a message (MSG-01). Files go straight to private storage first, with progress, then the
// message is sent with the list of uploaded files. Ctrl/Cmd + Enter sends.
export function Composer({
  threadId,
  viewerId,
  action,
}: {
  threadId: string;
  viewerId: string;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [body, setBody] = useState("");
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await action(prev, fd);
    if (result.ok) {
      setBody("");
      setFiles([]);
    }
    return result;
  }, {});
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const uploading = files.some((f) => !f.path && !f.error);

  async function add(list: FileList | null) {
    if (!list?.length) return;
    for (const original of Array.from(list).slice(0, 10 - files.length)) {
      const key = crypto.randomUUID();
      setFiles((f) => [...f, { key, name: original.name, type: original.type, size: original.size, percent: 0 }]);
      const file = await normaliseImage(original);
      const update = (patch: Partial<Attachment>) => setFiles((f) => f.map((x) => (x.key === key ? { ...x, ...patch } : x)));
      if (file.size > MAX) {
        update({ error: "Larger than 25 MB" });
        continue;
      }
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-100) || "file";
      const path = `${threadId}/${viewerId}/${key}/${safe}`;
      const { error } = await uploadWithProgress("messages", path, file, (percent) => update({ percent }));
      update(error ? { error: error.includes("mime") ? "This file type can't be sent" : error } : { path, name: file.name, type: file.type, size: file.size, percent: 100 });
    }
    if (input.current) input.current.value = "";
  }

  async function remove(a: Attachment) {
    setFiles((f) => f.filter((x) => x.key !== a.key));
    if (a.path) await createClient().storage.from("messages").remove([a.path]);
  }

  const ready = files.filter((f) => f.path).map((f) => ({ path: f.path, name: f.name, type: f.type, size: f.size }));

  return (
    <form ref={form} action={formAction} className="space-y-3">
      <FormMessage state={state.error ? state : undefined} />
      <input type="hidden" name="files" value={JSON.stringify(ready)} />
      <label htmlFor="message-body" className="sr-only">
        Message
      </label>
      <textarea
        id="message-body"
        name="body"
        className="input min-h-24"
        maxLength={5000}
        placeholder="Write a message…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            form.current?.requestSubmit();
          }
        }}
      />
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-xs">
          {files.map((f) => (
            <li key={f.key} className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${f.error ? "border-red-200 bg-red-50 text-red-700" : "border-border bg-slate-50"}`}>
              <span className="max-w-48 truncate">{f.name}</span>
              <span className="text-muted">{f.error ?? (f.path ? "Ready" : `${f.percent}%`)}</span>
              <button type="button" className="text-muted hover:text-foreground" onClick={() => remove(f)} aria-label={`Remove ${f.name}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Send disabled={uploading || (!body.trim() && ready.length === 0)} />
        <button type="button" className="btn-secondary" onClick={() => input.current?.click()} disabled={files.length >= 10}>
          Attach files
        </button>
        <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => add(e.target.files)} />
        <span className="text-xs text-muted">{uploading ? "Uploading…" : "PDF, Word, PowerPoint, images or audio, up to 25 MB."}</span>
      </div>
    </form>
  );
}
