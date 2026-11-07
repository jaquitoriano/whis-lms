import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { EmptyState, PageHeader } from "@/components/ui";
import { RichText } from "@/components/RichText";
import { type Contract, type Signature } from "@/lib/contracts";
import { contractStatusLabel, contractStatusStyle, formatDateOnly } from "@/lib/billing-shared";
import { signAsStudent } from "@/lib/contract-actions";
import { formatDateTime, tzLabel } from "@/lib/time";

export const metadata = { title: "My contract" };

// CON-01..03 for the student: read and sign the enrollment agreement, download signed copies.
export default async function MyContractPage({ searchParams }: { searchParams: Promise<{ signed?: string }> }) {
  const { signed } = await searchParams;
  const { supabase, profile } = await requireRole("student");
  const [{ data }, { data: sigs }] = await Promise.all([
    supabase.from("contracts").select("*").order("created_at", { ascending: false }),
    supabase.from("contract_signatures").select("*"),
  ]);
  const contracts = (data ?? []) as Contract[];
  const sigOf = (id: string) => ((sigs ?? []) as Signature[]).find((s) => s.contract_id === id);
  const toSign = contracts.find((c) => c.status === "sent");
  const others = contracts.filter((c) => c !== toSign);
  const tz = profile.timezone;

  return (
    <>
      <PageHeader title="My contract" description="Your enrollment agreement with the school." />
      {signed && (
        <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Thank you. Your contract is signed. A PDF copy has been emailed to you, and you can download it below.</p>
      )}
      {contracts.length === 0 && <EmptyState>You don&apos;t have a contract yet. The school office will send one when your package is set up.</EmptyState>}

      {toSign && (
        <section className="card mb-6 border-amber-200">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{toSign.title}</h2>
            <span className={`badge ${contractStatusStyle.sent}`}>{toSign.signer_kind === "self" ? "Please sign" : `Waiting for ${toSign.signer_name}`}</span>
          </div>
          <p className="mb-4 text-sm text-muted">
            {toSign.contract_number} · valid {formatDateOnly(toSign.valid_from)} – {toSign.valid_to ? formatDateOnly(toSign.valid_to) : "until your classes are used"}
          </p>
          <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-border p-4">
            <RichText text={toSign.body} />
          </div>
          {toSign.signer_kind === "self" ? (
            <ActionForm action={signAsStudent.bind(null, toSign.id)} submitLabel="Sign contract" pendingText="Signing…" className="mt-4 space-y-3">
              <div className="max-w-sm">
                <label className="label" htmlFor="signer_name">Type your full name to sign</label>
                <input className="input" id="signer_name" name="signer_name" required minLength={2} maxLength={200} autoComplete="name" defaultValue="" placeholder={profile.full_name} />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="agree" required className="mt-1" />
                <span>I have read this agreement and agree to it. I understand that typing my name here is my electronic signature.</span>
              </label>
              <p className="text-xs text-muted">We record the time, your IP address and browser with your signature, and email you a PDF copy.</p>
            </ActionForm>
          ) : (
            <p className="mt-4 text-sm text-muted">
              As you are a minor, this agreement is signed by {toSign.signer_name}. We emailed them a link to sign it.
            </p>
          )}
        </section>
      )}

      {others.length > 0 && (
        <section className="card">
          <h2 className="mb-3 font-semibold">{toSign ? "Earlier contracts" : "Contracts"}</h2>
          <ul className="divide-y divide-border text-sm">
            {others.map((c) => {
              const sig = sigOf(c.id);
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{c.title}</p>
                    <p className="text-xs text-muted">
                      {c.contract_number} · valid {formatDateOnly(c.valid_from)} – {c.valid_to ? formatDateOnly(c.valid_to) : "open"}
                      {sig && ` · signed by ${sig.signer_name} on ${formatDateTime(sig.signed_at, tz, { year: "numeric" })} (${tzLabel(tz)})`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${contractStatusStyle[c.status]}`}>{contractStatusLabel[c.status]}</span>
                    <a href={`/api/pdf/contract/${c.id}`} target="_blank" rel="noopener" className="btn-secondary text-xs">
                      PDF
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
