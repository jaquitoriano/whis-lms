import Link from "@/components/Link";
import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { createContract } from "@/lib/contract-actions";
import { getBillingSettings, getEnrollments } from "@/lib/billing";
import { money } from "@/lib/billing-shared";

export const metadata = { title: "New contract" };

export default async function NewContractPage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const { supabase } = await requireRole("admin");
  const sp = await searchParams;
  const [{ data: students }, { data: templates }, settings] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("role", "student").neq("status", "inactive").order("full_name"),
    supabase.from("contract_templates").select("version, title, created_at").order("version", { ascending: false }),
    getBillingSettings(supabase),
  ]);
  const student = (students ?? []).find((s) => s.id === sp.student);
  const [enrollments, { data: sp2 }, { data: guardians }] = student
    ? await Promise.all([
        getEnrollments(supabase, student.id),
        supabase.from("student_profiles").select("is_minor").eq("user_id", student.id).maybeSingle(),
        supabase.from("guardians").select("id, full_name, relationship, email").eq("student_id", student.id),
      ])
    : [[], { data: null }, { data: [] }];
  const minor = !!sp2?.is_minor;
  const withEmail = (guardians ?? []).filter((g) => g.email);

  return (
    <>
      <Link href="/admin/contracts" className="mb-4 inline-block text-sm text-muted hover:text-foreground">
        ← Back to contracts
      </Link>
      <PageHeader title="New contract" description="The text is filled in from the template and the student's package. You can edit it before sending." />

      <section className="card mb-6">
        <form action="/admin/contracts/new" className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="pick-student">Student</label>
            <select className="input" id="pick-student" name="student" defaultValue={student?.id ?? ""} required>
              <option value="" disabled>
                Choose a student
              </option>
              {(students ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-secondary">{student ? "Change" : "Continue"}</button>
        </form>
      </section>

      {student && (
        <section className="card">
          <h2 className="mb-4 font-semibold">Contract for {student.full_name}</h2>
          {minor && withEmail.length === 0 && (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {student.full_name} is a minor, so a parent or guardian must sign.{" "}
              <Link className="underline" href={`/admin/users/${student.id}?role=student`}>
                Add a guardian with an email address
              </Link>{" "}
              first.
            </p>
          )}
          <ActionForm action={createContract} submitLabel="Create draft" pendingText="Creating…">
            <input type="hidden" name="student_id" value={student.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="enrollment_id">Package</label>
                <select className="input" id="enrollment_id" name="enrollment_id" defaultValue={enrollments.find((e) => e.status === "active")?.id ?? ""}>
                  <option value="">No package (fill in by hand)</option>
                  {enrollments.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.package_name} · {money(e.price, e.currency)} · from {e.starts_on}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="template_version">Template</label>
                <select className="input" id="template_version" name="template_version" defaultValue={templates?.[0]?.version}>
                  {(templates ?? []).map((t) => (
                    <option key={t.version} value={t.version}>
                      v{t.version}: {t.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="valid_from">Valid from (default: package start)</label>
                <input className="input" id="valid_from" name="valid_from" type="date" />
              </div>
              <div>
                <label className="label" htmlFor="valid_to">Valid to (default: package end)</label>
                <input className="input" id="valid_to" name="valid_to" type="date" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="payment_terms">Payment terms</label>
              <input className="input" id="payment_terms" name="payment_terms" defaultValue={`Payment within ${settings.invoice_due_days} days of the invoice date.`} />
            </div>
            <fieldset>
              <legend className="label">Who signs?</legend>
              {minor ? (
                <p className="text-sm text-muted">A parent or guardian (the student is a minor).</p>
              ) : (
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="signer_kind" value="self" defaultChecked /> The student, in their portal
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="signer_kind" value="guardian" disabled={withEmail.length === 0} /> A parent or guardian, by email link
                  </label>
                </div>
              )}
            </fieldset>
            {withEmail.length > 0 && (
              <div>
                <label className="label" htmlFor="guardian_id">Guardian (if a guardian signs)</label>
                <select className="input" id="guardian_id" name="guardian_id">
                  {withEmail.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.full_name} ({g.relationship || "guardian"}) · {g.email}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </ActionForm>
        </section>
      )}
    </>
  );
}
