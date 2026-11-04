import Link from "next/link";
import { site } from "@/config/site";

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2 text-lg font-semibold">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white" aria-hidden>
            {site.shortName[0]}
          </span>
          {site.name}
        </Link>
        <div className="card p-6">
          <h1 className="mb-4 text-xl font-semibold">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}
