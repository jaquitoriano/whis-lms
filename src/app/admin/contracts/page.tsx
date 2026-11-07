import Link from "@/components/Link";
import { requireRole } from "@/lib/auth";
import { EmptyState, PageHeader, Pager, paginate } from "@/components/ui";
import { CONTRACT_SELECT, type Contract } from "@/lib/contracts";
import { contractStatusLabel, contractStatusStyle, formatDateOnly, type ContractStatus } from "@/lib/billing-shared";

export const metadata = { title: "Contracts" };

const FILTERS: { key: string; label: string; statuses?: ContractStatus[] }[] = [
  { key: "waiting", label: "Waiting for signature", statuses: ["sent"] },
  { key: "draft", label: "Drafts", statuses: ["draft"] },
  { key: "signed", label: "Signed", statuses: ["signed"] },
  { key: "closed", label: "Expired or void", statuses: ["expired", "void"] },
  { key: "all", label: "All" },
];

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const { supabase } = await requireRole("admin");
  const sp = await searchParams;
  const tab = FILTERS.find((f) => f.key === sp.tab) ?? FILTERS[0];
  let q = supabase.from("contracts").select(CONTRACT_SELECT).order("created_at", { ascending: false });
  if (tab.statuses) q = q.in("status", tab.statuses);
  const { data } = await q;
  const page = paginate((data ?? []) as Contract[], sp.page);

  return (
    <>
      <PageHeader
        title="Contracts"
        description="Enrollment agreements (CON-01..03). Students sign in their portal; a minor's parent or guardian signs through an emailed link."
        action={
          <div className="flex gap-2">
            <Link href="/admin/contracts/templates" className="btn-secondary">
              Templates
            </Link>
            <Link href="/admin/contracts/new" className="btn-primary">
              New contract
            </Link>
          </div>
        }
      />
      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-border" aria-label="Contract status">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/contracts?tab=${f.key}`}
            aria-current={f.key === tab.key ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${f.key === tab.key ? "border-brand-600 font-medium text-brand-700" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {page.rows.length === 0 ? (
        <EmptyState>No contracts here.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Contract</th>
                <th className="px-4 py-2 font-medium">Student</th>
                <th className="px-4 py-2 font-medium">Signer</th>
                <th className="px-4 py-2 font-medium">Valid</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {page.rows.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/admin/contracts/${c.id}`} className="font-medium text-brand-700 hover:underline">
                      {c.contract_number}
                    </Link>
                    <span className="block text-xs text-muted">{c.title}</span>
                  </td>
                  <td className="px-4 py-2">{c.student?.full_name}</td>
                  <td className="px-4 py-2">
                    {c.signer_name || "—"}
                    {c.signer_kind === "guardian" && <span className="text-muted"> (guardian)</span>}
                  </td>
                  <td className="px-4 py-2">
                    {formatDateOnly(c.valid_from)} – {c.valid_to ? formatDateOnly(c.valid_to) : "open"}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`badge ${contractStatusStyle[c.status]}`}>{contractStatusLabel[c.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager {...page} base="/admin/contracts" params={{ tab: tab.key }} />
    </>
  );
}
