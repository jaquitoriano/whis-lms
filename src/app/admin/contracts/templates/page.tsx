import Link from "@/components/Link";
import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { FORMAT_HINT, RichText } from "@/components/RichText";
import { MERGE_FIELDS } from "@/lib/contracts";
import { addTemplateVersion } from "@/lib/contract-actions";
import { formatDateOnly } from "@/lib/billing-shared";

export const metadata = { title: "Contract templates" };

// Versioned like class policies: a saved version never changes, so every contract can show
// exactly which template text it started from.
export default async function TemplatesPage() {
  const { supabase } = await requireRole("admin");
  const { data } = await supabase.from("contract_templates").select("*").order("version", { ascending: false });
  const versions = data ?? [];
  const latest = versions[0];
  return (
    <>
      <Link href="/admin/contracts" className="mb-4 inline-block text-sm text-muted hover:text-foreground">
        ← Back to contracts
      </Link>
      <PageHeader title="Contract templates" description="Saving creates a new version. Contracts already created keep their own text." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="card">
          <h2 className="mb-4 font-semibold">New version{latest ? ` (based on v${latest.version})` : ""}</h2>
          <ActionForm action={addTemplateVersion} submitLabel="Save as new version">
            <div>
              <label className="label" htmlFor="title">Title</label>
              <input className="input" id="title" name="title" defaultValue={latest?.title ?? "Enrollment agreement"} required />
            </div>
            <div>
              <label className="label" htmlFor="body">Text</label>
              <textarea className="input min-h-[28rem] font-mono text-xs" id="body" name="body" defaultValue={latest?.body ?? ""} required />
              <p className="mt-1 text-xs text-muted">{FORMAT_HINT}</p>
            </div>
          </ActionForm>
        </section>
        <div className="space-y-6">
          <section className="card text-sm">
            <h2 className="mb-2 font-semibold">Merge fields</h2>
            <p className="mb-3 text-muted">Type these in the text. They are filled in when a contract is created.</p>
            <ul className="space-y-1">
              {MERGE_FIELDS.map((f) => (
                <li key={f.key} className="flex justify-between gap-3">
                  <code className="text-xs">{`{{${f.key}}}`}</code>
                  <span className="text-right text-muted">{f.label}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="card text-sm">
            <h2 className="mb-2 font-semibold">Versions</h2>
            <ul className="space-y-2">
              {versions.map((v) => (
                <li key={v.version}>
                  <details>
                    <summary className="cursor-pointer">
                      v{v.version}: {v.title} <span className="text-muted">· {formatDateOnly(v.created_at)}</span>
                    </summary>
                    <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-border p-3">
                      <RichText text={v.body} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
