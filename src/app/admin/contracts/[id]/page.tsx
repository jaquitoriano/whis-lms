import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader } from "@/components/ui";
import { FORMAT_HINT, RichText } from "@/components/RichText";
import { CONTRACT_SELECT, type Contract, type Signature } from "@/lib/contracts";
import { contractStatusLabel, contractStatusStyle, formatDateOnly, money } from "@/lib/billing-shared";
import { deleteDraftContract, resendGuardianLink, sendContract, updateContractDraft, voidContract } from "@/lib/contract-actions";
import { formatDateTime, tzLabel } from "@/lib/time";

export const metadata = { title: "Contract" };

export default async function ContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; tone?: string }> }) {
  const { notice, tone } = await searchParams;
  const { supabase, profile } = await requireRole("admin");
  const { id } = await params;
  const [{ data: c }, { data: sig }] = await Promise.all([
    supabase.from("contracts").select(CONTRACT_SELECT).eq("id", id).maybeSingle(),
    supabase.from("contract_signatures").select("*").eq("contract_id", id).maybeSingle(),
  ]);
  if (!c) notFound();
  const contract = c as Contract;
  const signature = sig as Signature | null;
  const { data: guardians } =
    contract.status === "draft" && contract.signer_kind === "guardian"
      ? await supabase.from("guardians").select("id, full_name, email").eq("student_id", contract.student_id).not("email", "is", null)
      : { data: [] };
  const tz = profile.timezone;

  return (
    <>
      <Link href="/admin/contracts" className="mb-4 inline-block text-sm text-muted hover:text-foreground">
        ← Back to contracts
      </Link>
      <PageHeader
        title={`${contract.contract_number}: ${contract.student?.full_name}`}
        description={`${contract.title} · template v${contract.template_version ?? "—"} · created ${formatDateOnly(contract.created_at)}`}
        action={
          <div className="flex items-center gap-2">
            <span className={`badge ${contractStatusStyle[contract.status]}`}>{contractStatusLabel[contract.status]}</span>
            {contract.status !== "draft" && (
              <a className="btn-secondary" href={`/api/pdf/contract/${contract.id}`} target="_blank" rel="noopener">
                Download PDF
              </a>
            )}
          </div>
        }
      />

      {notice && (
        <p role={tone === "error" ? "alert" : "status"} className={`mb-4 break-words rounded-lg px-3 py-2 text-sm ${tone === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
          {notice}
        </p>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="card">
          {contract.status === "draft" ? (
            <ActionForm action={updateContractDraft.bind(null, contract.id)} submitLabel="Save draft">
              <div>
                <label className="label" htmlFor="title">Title</label>
                <input className="input" id="title" name="title" defaultValue={contract.title} required />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="valid_from">Valid from</label>
                  <input className="input" id="valid_from" name="valid_from" type="date" defaultValue={contract.valid_from} required />
                </div>
                <div>
                  <label className="label" htmlFor="valid_to">Valid to</label>
                  <input className="input" id="valid_to" name="valid_to" type="date" defaultValue={contract.valid_to ?? ""} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="payment_terms">Payment terms (record)</label>
                <input className="input" id="payment_terms" name="payment_terms" defaultValue={contract.payment_terms} />
              </div>
              {(guardians ?? []).length > 0 && (
                <div>
                  <label className="label" htmlFor="guardian_id">Guardian who signs</label>
                  <select className="input" id="guardian_id" name="guardian_id" defaultValue={contract.guardian_id ?? ""}>
                    {(guardians ?? []).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.full_name} · {g.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="label" htmlFor="body">Contract text</label>
                <textarea className="input min-h-[28rem] font-mono text-xs" id="body" name="body" defaultValue={contract.body} required />
                <p className="mt-1 text-xs text-muted">{FORMAT_HINT}</p>
              </div>
            </ActionForm>
          ) : (
            <article>
              <h2 className="mb-3 text-lg font-semibold">{contract.title}</h2>
              <RichText text={contract.body} />
            </article>
          )}
        </section>

        <div className="space-y-6">
          <section className="card text-sm">
            <h2 className="mb-3 font-semibold">Details</h2>
            <dl className="space-y-2">
              <div>
                <dt className="text-muted">Signer</dt>
                <dd>
                  {contract.signer_name || "—"} ({contract.signer_kind === "self" ? "the student" : "parent or guardian"})
                  {contract.signer_email && <span className="block text-xs text-muted">{contract.signer_email}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Valid</dt>
                <dd>
                  {formatDateOnly(contract.valid_from)} – {contract.valid_to ? formatDateOnly(contract.valid_to) : "until the package is used"}
                </dd>
              </div>
              {contract.tuition != null && (
                <div>
                  <dt className="text-muted">Tuition</dt>
                  <dd>{money(contract.tuition, contract.currency)}</dd>
                </div>
              )}
              {contract.sent_at && (
                <div>
                  <dt className="text-muted">Sent</dt>
                  <dd>{formatDateTime(contract.sent_at, tz, { year: "numeric" })}</dd>
                </div>
              )}
              {contract.document_hash && (
                <div>
                  <dt className="text-muted">Document fingerprint (SHA-256)</dt>
                  <dd className="break-all font-mono text-xs">{contract.document_hash}</dd>
                </div>
              )}
            </dl>
          </section>

          {signature && (
            <section className="card text-sm">
              <h2 className="mb-3 font-semibold">Signature</h2>
              <dl className="space-y-2">
                <div>
                  <dt className="text-muted">Signed by</dt>
                  <dd>
                    {signature.signer_name} ({signature.signer_relationship === "self" ? "student" : "parent or guardian"})
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">When</dt>
                  <dd>
                    {formatDateTime(signature.signed_at, tz, { year: "numeric" })} ({tzLabel(tz)})
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">IP address and browser</dt>
                  <dd className="break-all text-xs">
                    {signature.ip ?? "—"} · {signature.user_agent ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Fingerprint matches the sent document</dt>
                  <dd>{signature.document_hash === contract.document_hash ? "Yes" : "No"}</dd>
                </div>
              </dl>
            </section>
          )}

          {contract.status === "draft" && (
            <section className="card space-y-3">
              <h2 className="font-semibold">Send for signature</h2>
              <p className="text-sm text-muted">
                {contract.signer_kind === "self"
                  ? "The student will see it in their portal and get a notification."
                  : `${contract.signer_name} will get an email with a one-time link, valid for 14 days.`}{" "}
                After sending, the text can&apos;t be changed.
              </p>
              <ActionForm action={sendContract.bind(null, contract.id)} submitLabel="Send contract" pendingText="Sending…" className="space-y-2">
                <span />
              </ActionForm>
              <form action={deleteDraftContract.bind(null, contract.id)}>
                <SubmitButton className="btn-danger text-xs" pendingText="Deleting…">
                  Delete draft
                </SubmitButton>
              </form>
            </section>
          )}

          {contract.status === "sent" && contract.signer_kind === "guardian" && (
            <section className="card space-y-2">
              <h2 className="font-semibold">Signing link</h2>
              <p className="text-sm text-muted">Send {contract.signer_name} a new link if the old one expired or was lost. The old link stops working.</p>
              <ActionForm action={resendGuardianLink.bind(null, contract.id)} submitLabel="Send a new link" pendingText="Sending…" className="space-y-2">
                <span />
              </ActionForm>
            </section>
          )}

          {(contract.status === "sent" || contract.status === "signed") && (
            <details className="card">
              <summary className="cursor-pointer text-sm font-medium text-red-700">Void this contract</summary>
              <p className="mt-2 text-xs text-muted">For changes, void it and create a new contract. The voided one stays in the records.</p>
              <ActionForm action={voidContract.bind(null, contract.id)} submitLabel="Void contract" pendingText="Voiding…" className="mt-3 space-y-2">
                <input className="input" name="reason" required placeholder="Reason" aria-label="Reason" />
              </ActionForm>
            </details>
          )}
          {contract.status === "void" && <p className="card text-sm">Voided {formatDateTime(contract.voided_at!, tz, { year: "numeric" })}: {contract.void_reason}</p>}
        </div>
      </div>
    </>
  );
}
