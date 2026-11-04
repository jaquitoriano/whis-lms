import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { site } from "@/config/site";
import { signOut } from "@/app/(auth)/actions";
import { PoliciesPage } from "@/components/portal/Policies";

export const metadata = { title: "Class Policies" };

// POL-04: students land here until they accept the latest class policies.
export default async function AcceptPoliciesPage() {
  const { supabase, profile } = await requireRole("student");
  const { data: mustAccept } = await supabase.rpc("needs_policy_acceptance");
  if (!mustAccept) redirect("/student");
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white" aria-hidden>
            {site.shortName[0]}
          </span>
          {site.name}
        </Link>
        <form action={signOut}>
          <button type="submit" className="btn-secondary px-3 py-1.5 text-xs">
            Log out
          </button>
        </form>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <PoliciesPage supabase={supabase} viewer={profile} gate />
      </main>
    </div>
  );
}
