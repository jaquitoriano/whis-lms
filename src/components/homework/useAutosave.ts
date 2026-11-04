"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Saver<T> = (patch: Partial<T>) => Promise<{ ok: boolean; savedAt?: string }>;

// Debounced autosave for text fields: saves ~1.5 s after typing stops, on blur
// (via `flush`), and when the page is closed.
export function useAutosave<T extends Record<string, string>>(initial: T, initialSavedAt: string | null, save: Saver<T>) {
  const [values, setValues] = useState<T>(initial);
  const [status, setStatus] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [savedAt, setSavedAt] = useState(initialSavedAt);
  const dirty = useRef<Partial<T>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const patch = dirty.current;
    if (!Object.keys(patch).length) return true;
    dirty.current = {};
    setStatus("saving");
    const r = await saveRef.current(patch);
    if (r.ok) {
      setStatus(Object.keys(dirty.current).length ? "dirty" : "saved");
      if (r.savedAt) setSavedAt(r.savedAt);
      return true;
    }
    dirty.current = { ...patch, ...dirty.current };
    setStatus("error");
    return false;
  }, []);

  const update = (k: keyof T, v: string) => {
    setValues((prev) => ({ ...prev, [k]: v }));
    dirty.current = { ...dirty.current, [k]: v } as Partial<T>;
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 1500);
  };

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(dirty.current).length) {
        void flush();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [flush]);

  const statusText =
    status === "saving"
      ? "Saving…"
      : status === "dirty"
        ? "Unsaved changes"
        : status === "error"
          ? "Couldn't save. Check your connection."
          : savedAt
            ? `Draft saved ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "";

  return { values, update, flush, status, statusText };
}
