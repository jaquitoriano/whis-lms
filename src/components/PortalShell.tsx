import Link from "next/link";
import { site } from "@/config/site";
import { signOut } from "@/app/(auth)/actions";
import { Avatar } from "@/components/ui";
import { NavLink } from "@/components/NavLink";
import type { Profile } from "@/lib/types";

export type NavItem = { href: string; label: string; phase?: number };

// Shared layout for the admin, teacher and student portals.
// Items with a `phase` are shown as "coming soon" so users can see what's planned.
export function PortalShell({
  profile,
  roleLabel,
  nav,
  children,
}: {
  profile: Profile;
  roleLabel: string;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const live = nav.filter((n) => !n.phase);
  const soon = nav.filter((n) => n.phase);
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-border bg-surface md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 px-4 py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white" aria-hidden>
              {site.shortName[0]}
            </span>
            <span className="truncate">{site.shortName}</span>
          </Link>
          <span className="badge bg-brand-50 text-brand-700">{roleLabel}</span>
        </div>
        <nav aria-label="Portal" className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:overflow-visible">
          {live.map((n) => (
            <NavLink key={n.href} href={n.href}>
              {n.label}
            </NavLink>
          ))}
          {soon.length > 0 && <p className="hidden px-3 pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-muted md:block">Coming soon</p>}
          {soon.map((n) => (
            <span key={n.href} className="hidden cursor-default items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-400 md:flex" title={`Planned for Phase ${n.phase}`}>
              {n.label}
              <span className="text-[10px]">P{n.phase}</span>
            </span>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-border bg-surface px-4 py-3">
          <Avatar profile={profile} size={32} />
          <span className="hidden text-sm font-medium sm:inline">{profile.full_name}</span>
          <form action={signOut}>
            <button type="submit" className="btn-secondary px-3 py-1.5 text-xs">
              Log out
            </button>
          </form>
        </header>
        {profile.status === "on_hold" && (
          <p className="bg-amber-50 px-4 py-2 text-sm text-amber-800">Your account is on hold. Please contact the school office if you think this is a mistake.</p>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
