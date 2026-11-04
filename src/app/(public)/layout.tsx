import Link from "next/link";
import { site } from "@/config/site";
import { getSession, homeFor } from "@/lib/auth";

const nav = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About Us" },
  { href: "/classes", label: "Classes" },
  { href: "/teachers", label: "Teachers" },
  { href: "/contact", label: "Contact Us" },
];

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white" aria-hidden>
              {site.shortName[0]}
            </span>
            {site.name}
          </Link>
          <nav className="order-3 flex w-full gap-4 overflow-x-auto text-sm sm:order-none sm:w-auto" aria-label="Main">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="whitespace-nowrap text-muted hover:text-foreground">
                {n.label}
              </Link>
            ))}
          </nav>
          {session ? (
            <Link href={homeFor(session.profile.role)} className="btn-primary">
              My dashboard
            </Link>
          ) : (
            <div className="flex gap-2">
              <Link href="/contact#trial" className="btn-secondary hidden sm:inline-flex">
                Book a trial
              </Link>
              <Link href="/login" className="btn-primary">
                Log in
              </Link>
            </div>
          )}
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border bg-background">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm text-muted sm:grid-cols-3">
          <div>
            <p className="font-semibold text-foreground">{site.name}</p>
            <p className="mt-1">{site.tagline}</p>
          </div>
          <div>
            <p className="font-semibold text-foreground">Contact</p>
            <p className="mt-1">{site.contact.email}</p>
            <p>{site.contact.phone}</p>
            <p>{site.contact.hours}</p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-foreground">More</p>
            <Link href="/#faq">FAQ</Link>
            <Link href="/privacy">Privacy policy</Link>
            <Link href="/terms">Terms of use</Link>
          </div>
        </div>
        <p className="pb-6 text-center text-xs text-muted">© {new Date().getFullYear()} {site.name}</p>
      </footer>
    </div>
  );
}
