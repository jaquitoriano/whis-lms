"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// While a conversation is open and the tab is visible, checks every 10 seconds for a newer message
// (one tiny query, under the same access rules) and reloads the page only when there is one.
export function LiveRefresh({ threadId, latest }: { threadId: string; latest: string | null }) {
  const router = useRouter();
  const last = useRef(latest);
  useEffect(() => {
    last.current = latest;
  }, [latest]);

  useEffect(() => {
    const supabase = createClient();
    let stopped = false;
    async function check() {
      if (stopped || document.visibilityState !== "visible") return;
      const { data } = await supabase.from("messages").select("created_at").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (data && (!last.current || data.created_at > last.current)) {
        last.current = data.created_at;
        router.refresh();
      }
    }
    const timer = setInterval(check, 10000);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [threadId, router]);

  return null;
}
