"use client";

import { useEffect, useRef } from "react";

// Opens a conversation at the newest message, and follows new ones as they arrive.
export function ScrollToEnd({ marker }: { marker: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!location.hash) ref.current?.scrollIntoView({ block: "end" });
  }, [marker]);
  return <div ref={ref} aria-hidden />;
}
