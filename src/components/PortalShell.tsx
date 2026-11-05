import Link from "@/components/Link";
import { site } from "@/config/site";
import { signOut } from "@/app/(auth)/actions";
import { Avatar } from "@/components/ui";
import { NavLink } from "@/components/NavLink";
import { MobileMenu } from "@/components/MobileMenu";
import { NotificationBell } from "@/components/portal/NotificationBell";
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
  const logo = (
    <Link href="/" className="flex min-w-0 items-center gap-2 font-semibold">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white" aria-hidden>
        {site.shortName[0]}
      </span>
      <span className="truncate">{site.shortName}</span>
    </Link>
  );
  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden border-r border-border bg-surface md:sticky md:top-0 md:block md:h-screen md:w-60 md:shrink-0 md:overflow-y-auto">
        <div className="flex items-center justify-between gap-2 px-4 py-4">
          {logo}
          <span className="badge bg-brand-50 text-brand-700">{roleLabel}</span>
        </div>
        <nav aria-label="Portal" className="flex flex-col gap-1 px-2 pb-3">
          {live.map((n) => (
            <NavLink key={n.href} href={n.href}>
              {n.label}
            </NavLink>
          ))}
          {soon.length > 0 && <p className="px-3 pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-muted">Coming soon</p>}
          {soon.map((n) => (
            <span key={n.href} className="cursor-default rounded-lg px-3 py-2 text-sm text-slate-500">
              {n.label}
            </span>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[57px] items-center gap-2 border-b border-border bg-surface px-3 md:justify-end md:gap-3 md:px-4">
          <div className="mr-auto min-w-0 md:hidden">{logo}</div>
          <NotificationBell role={profile.role} />
          <Avatar profile={profile} size={32} />
          <span className="hidden text-sm font-medium md:inline">{profile.full_name}</span>
          <form action={signOut} className="hidden md:block">
            <button type="submit" className="btn-secondary px-3 py-1.5 text-xs">
              Log out
            </button>
          </form>
          <MobileMenu>
            <nav aria-label="Portal menu" className="flex flex-col gap-1">
              <p className="px-3 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-muted">{roleLabel} menu</p>
              {live.map((n) => (
                <NavLink key={n.href} href={n.href}>
                  {n.label}
                </NavLink>
              ))}
              {soon.length > 0 && <p className="px-3 pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-muted">Coming soon</p>}
              {soon.map((n) => (
                <span key={n.href} className="px-3 py-2 text-sm text-slate-500">
                  {n.label}
                </span>
              ))}
            </nav>
            <form action={signOut} className="mt-3 border-t border-border p-3">
              <button type="submit" className="btn-secondary w-full">
                Log out
              </button>
            </form>
          </MobileMenu>
        </header>
        {profile.status === "on_hold" && (
          <p className="bg-amber-50 px-4 py-2 text-sm text-amber-800">Your account is on hold. Please contact the school office if you think this is a mistake.</p>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
