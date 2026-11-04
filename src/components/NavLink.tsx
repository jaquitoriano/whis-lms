"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const search = useSearchParams();
  const [hrefPath, hrefQuery] = href.split("?");

  let active: boolean;
  if (hrefQuery) {
    // e.g. /admin/users?role=teacher is active for that role's list and its user pages.
    const want = new URLSearchParams(hrefQuery);
    active = path.startsWith(hrefPath) && [...want].every(([k, v]) => search.get(k) === v);
  } else {
    // Portal roots (/admin, /teacher, /student) are active only on exact match.
    const isRoot = hrefPath.split("/").length === 2;
    active = isRoot ? path === hrefPath : path === hrefPath || path.startsWith(hrefPath + "/");
  }

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${active ? "bg-brand-50 font-medium text-brand-700" : "text-foreground hover:bg-slate-50"}`}
    >
      {children}
    </Link>
  );
}
