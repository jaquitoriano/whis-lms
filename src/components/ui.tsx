import Link from "@/components/Link";
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

export function ComingSoon({ children }: { phase: number; children: React.ReactNode }) {
  return (
    <div className="card border-dashed">
      <p className="text-sm text-muted">
        {children} <span className="badge ml-1 bg-slate-100 text-slate-600">Coming soon</span>
      </p>
    </div>
  );
}

// Long lists are shown a page at a time, so nobody downloads hundreds of rows to read the first few.
export const PER_PAGE = 50;

export function paginate<T>(rows: T[], page: string | undefined, perPage = PER_PAGE) {
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(pages, Math.max(1, Math.floor(Number(page)) || 1));
  return { rows: rows.slice((current - 1) * perPage, current * perPage), current, pages, total: rows.length, perPage };
}

export function Pager({
  current,
  pages,
  total,
  perPage,
  base,
  params = {},
}: {
  current: number;
  pages: number;
  total: number;
  perPage: number;
  base: string;
  params?: Record<string, string | undefined>;
}) {
  if (pages <= 1) return null;
  const href = (page: number) => {
    const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
    if (page > 1) q.set("page", String(page));
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  return (
    <nav className="mt-4 flex items-center justify-between gap-3 text-sm" aria-label="Pages">
      <span className="text-muted">
        {(current - 1) * perPage + 1}–{Math.min(current * perPage, total)} of {total}
      </span>
      <span className="flex gap-2">
        {current > 1 && (
          <Link href={href(current - 1)} className="btn-secondary">
            Previous
          </Link>
        )}
        {current < pages && (
          <Link href={href(current + 1)} className="btn-secondary">
            Next
          </Link>
        )}
      </span>
    </nav>
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
