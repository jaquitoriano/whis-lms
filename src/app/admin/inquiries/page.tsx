import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { courseTypeLabel } from "@/config/site";
import { EmptyState, PageHeader, formatDate } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Inquiries" };

type Inquiry = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  course_type: string | null;
  message: string | null;
  wants_trial: boolean;
  status: "new" | "contacted" | "closed";
  created_at: string;
};

async function setInquiryStatus(id: string, formData: FormData) {
  "use server";
  const { supabase } = await requireRole("admin");
  const status = String(formData.get("status"));
  if (!["new", "contacted", "closed"].includes(status)) return;
  await supabase.from("inquiries").update({ status }).eq("id", id);
  revalidatePath("/admin/inquiries");
  revalidatePath("/admin");
}

const style = { new: "bg-brand-50 text-brand-700", contacted: "bg-amber-50 text-amber-700", closed: "bg-slate-100 text-slate-600" };

export default async function InquiriesPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { supabase } = await requireRole("admin");
  const { show } = await searchParams;
  let q = supabase.from("inquiries").select("*").order("created_at", { ascending: false }).limit(200);
  if (show !== "all") q = q.neq("status", "closed");
  const { data } = await q;
  const items = (data ?? []) as Inquiry[];

  return (
    <>
      <PageHeader
        title="Inquiries and trial requests"
        description="From the Contact page form."
        action={
          <a href={show === "all" ? "/admin/inquiries" : "/admin/inquiries?show=all"} className="btn-secondary">
            {show === "all" ? "Hide closed" : "Show closed"}
          </a>
        }
      />
      {items.length === 0 ? (
        <EmptyState>No open inquiries.</EmptyState>
      ) : (
        <div className="space-y-3">
          {items.map((i) => (
            <article key={i.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {i.full_name} <span className={`badge ml-1 ${style[i.status]}`}>{i.status}</span>
                    {i.wants_trial && <span className="badge ml-1 bg-green-50 text-green-700">Trial</span>}
                  </p>
                  <p className="text-sm text-muted">
                    <a className="hover:underline" href={`mailto:${i.email}`}>{i.email}</a>
                    {i.phone && ` · ${i.phone}`}
                    {i.course_type && ` · ${courseTypeLabel[i.course_type]}`} · {formatDate(i.created_at)}
                  </p>
                </div>
                <form action={setInquiryStatus.bind(null, i.id)} className="flex gap-2">
                  <select name="status" defaultValue={i.status} className="input w-auto py-1 text-xs" aria-label="Status">
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="closed">Closed</option>
                  </select>
                  <SubmitButton className="btn-secondary px-3 py-1 text-xs">Update</SubmitButton>
                </form>
              </div>
              {i.message && <p className="mt-3 whitespace-pre-line text-sm">{i.message}</p>}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
