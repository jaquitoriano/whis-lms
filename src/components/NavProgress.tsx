"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// A thin bar at the top of the page from the moment a link is tapped until the new page arrives.
// (loading.tsx isn't used in the portals: it would turn refused pages from real 404s into 200s.)
export function NavProgress() {
  const path = usePathname();
  const search = useSearchParams();
  const current = `${path}?${search}`;
  const [startedOn, setStartedOn] = useState<string | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const to = new URL(a.href);
      if (to.origin !== location.origin || (to.pathname === location.pathname && to.search === location.search)) return;
      setStartedOn(current);
    };
    // Capture phase: next/link cancels the click's default action before it would bubble up here.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [current]);

  // The bar belongs to the page it started on, so it disappears as soon as the URL changes.
  return startedOn === current ? <div className="nav-progress" aria-hidden /> : null;
}
