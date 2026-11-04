import type { SupabaseClient } from "@supabase/supabase-js";
import { ActionForm } from "@/components/ActionForm";
import { RichText } from "@/components/RichText";
import { EmptyState, PageHeader, formatDate } from "@/components/ui";
import { acceptPolicies } from "@/lib/portal-actions";
import type { Profile } from "@/lib/types";

export type Policy = { version: number; title: string; body: string; summary: string; published_at: string };

export async function latestPolicy(supabase: SupabaseClient) {
  const { data } = await supabase.from("policies").select("*").order("version", { ascending: false }).limit(1).maybeSingle();
  return data as Policy | null;
}

// POL-02: always viewable. POL-04: students acknowledge the latest version.
export async function PoliciesPage({ supabase, viewer, gate = false }: { supabase: SupabaseClient; viewer: Profile; gate?: boolean }) {
  const policy = await latestPolicy(supabase);
  if (!policy) {
    return (
      <>
        <PageHeader title="Class policies" />
        <EmptyState>The school hasn&apos;t published its class policies yet.</EmptyState>
      </>
    );
  }
  const { data: acc } =
    viewer.role === "student"
      ? await supabase.from("policy_acceptances").select("accepted_at").eq("user_id", viewer.id).eq("version", policy.version).maybeSingle()
      : { data: null };

  return (
    <>
      <PageHeader title={policy.title} description={`Version ${policy.version} · published ${formatDate(policy.published_at)}`} />
      {gate && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {policy.version > 1 ? "The class policies have been updated." : "Welcome!"} Please read them and confirm below to continue to your account.
        </p>
      )}
      <article className="card max-w-3xl">
        {policy.summary && <p className="mb-4 text-sm text-muted">{policy.summary}</p>}
        <RichText text={policy.body} />
      </article>
      {viewer.role === "student" && (
        <div className="card mt-4 max-w-3xl">
          {acc ? (
            <p className="text-sm text-green-700">You accepted these policies on {formatDate(acc.accepted_at)}.</p>
          ) : (
            <ActionForm action={acceptPolicies} submitLabel="Accept and continue" pendingText="Saving…">
              <input type="hidden" name="version" value={policy.version} />
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="agree" required className="mt-1" /> I have read and understood the class policies.
              </label>
            </ActionForm>
          )}
        </div>
      )}
    </>
  );
}
