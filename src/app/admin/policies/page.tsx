import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { FORMAT_HINT, RichText } from "@/components/RichText";
import { PageHeader, formatDate } from "@/components/ui";
import { latestPolicy } from "@/components/portal/Policies";
import { publishPolicies } from "@/lib/admin-comms-actions";

export const metadata = { title: "Class policies" };

// POL-01..04: publish versions and see who has accepted the current one.
export default async function AdminPoliciesPage({ searchParams }: { searchParams: Promise<{ published?: string }> }) {
  const { supabase } = await requireRole("admin");
  const { published } = await searchParams;
  const policy = await latestPolicy(supabase);
  const [{ data: students }, { data: acc }, { data: versions }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, status").eq("role", "student").neq("status", "inactive").order("full_name"),
    policy ? supabase.from("policy_acceptances").select("user_id, accepted_at").eq("version", policy.version) : Promise.resolve({ data: [] }),
    supabase.from("policies").select("version, published_at").order("version", { ascending: false }),
  ]);
  const accepted = new Map((acc ?? []).map((a) => [a.user_id, a.accepted_at as string]));
  const pending = (students ?? []).filter((s) => !accepted.has(s.id));

  return (
    <>
      <PageHeader
        title="Class policies"
        description={policy ? `Current: version ${policy.version}, published ${formatDate(policy.published_at)}` : "Not published yet."}
      />
      {published && (
        <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          New version published. Teachers and students have been notified, and students will be asked to accept it when they next log in.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="card">
          <h2 className="mb-1 font-semibold">{policy ? "Publish an updated version" : "Publish class policies"}</h2>
          <p className="mb-4 text-sm text-muted">Published versions can&apos;t be edited. Each change creates a new version that students must accept.</p>
          <ActionForm action={publishPolicies} submitLabel="Publish new version" pendingText="Publishing…">
            <div>
              <label className="label" htmlFor="title">Title</label>
              <input className="input" id="title" name="title" defaultValue={policy?.title ?? "Class policies"} />
            </div>
            <div>
              <label className="label" htmlFor="summary">Summary of changes (shown at the top)</label>
              <input className="input" id="summary" name="summary" placeholder="e.g. Cancellation notice changed from 12 to 24 hours" />
            </div>
            <div>
              <label className="label" htmlFor="body">Policies</label>
              <textarea className="input min-h-96 font-mono text-[13px]" id="body" name="body" defaultValue={policy?.body ?? ""} required />
              <p className="mt-1 text-xs text-muted">{FORMAT_HINT}</p>
            </div>
          </ActionForm>
        </section>

        <div className="space-y-6">
          <section className="card">
            <h2 className="mb-2 font-semibold">Acceptance of version {policy?.version ?? "—"}</h2>
            <p className="mb-3 text-sm">
              <span className="font-medium">{accepted.size}</span> of {(students ?? []).length} active students have accepted.
            </p>
            {pending.length > 0 && (
              <>
                <p className="mb-1 text-xs font-medium uppercase text-muted">Not yet accepted</p>
                <ul className="divide-y divide-border text-sm">
                  {pending.map((s) => (
                    <li key={s.id} className="py-1.5">
                      <Link href={`/admin/users/${s.id}?role=student`} className="hover:text-brand-700">
                        {s.full_name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          {policy && (
            <section className="card">
              <h2 className="mb-2 font-semibold">Current version as students see it</h2>
              <RichText text={policy.body} />
            </section>
          )}
          {(versions ?? []).length > 1 && (
            <section className="card">
              <h2 className="mb-2 font-semibold">History</h2>
              <ul className="text-sm text-muted">
                {(versions ?? []).map((v) => (
                  <li key={v.version}>
                    Version {v.version} · {formatDate(v.published_at)}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
