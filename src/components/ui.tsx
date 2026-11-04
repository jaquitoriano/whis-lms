import Link from "next/link";
import type { AccountStatus, Profile } from "@/lib/types";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Avatar({ profile, size = 40 }: { profile: Pick<Profile, "full_name" | "avatar_url">; size?: number }) {
  const initials = profile.full_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  if (profile.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={profile.avatar_url} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}

const statusStyle: Record<AccountStatus, string> = {
  active: "bg-green-50 text-green-700",
  on_hold: "bg-amber-50 text-amber-700",
  inactive: "bg-slate-100 text-slate-600",
};
const statusText: Record<AccountStatus, string> = { active: "Active", on_hold: "On hold", inactive: "Inactive" };

export function StatusBadge({ status }: { status: AccountStatus }) {
  return <span className={`badge ${statusStyle[status]}`}>{statusText[status]}</span>;
}

export function StatCard({ label, value, href }: { label: string; value: React.ReactNode; href?: string }) {
  const body = (
    <div className="card h-full">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-xl transition hover:ring-2 hover:ring-brand-100">
      {body}
    </Link>
  ) : (
    body
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">{children}</div>;
}

export function ComingSoon({ phase, children }: { phase: number; children: React.ReactNode }) {
  return (
    <div className="card border-dashed">
      <p className="text-sm text-muted">
        {children} <span className="badge ml-1 bg-slate-100 text-slate-600">Phase {phase}</span>
      </p>
    </div>
  );
}

export function FormMessage({ state }: { state: { error?: string; message?: string } | undefined }) {
  if (!state) return null;
  if (state.error)
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {state.error}
      </p>
    );
  if (state.message) return <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{state.message}</p>;
  return null;
}

export function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
