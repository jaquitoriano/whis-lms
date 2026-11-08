import { requireRole } from "@/lib/auth";
import { ReportEditorPage } from "@/components/progress/ReportEditorPage";

export const metadata = { title: "Progress report" };

export default async function AdminReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, profile } = await requireRole("admin");
  const { id } = await params;
  return <ReportEditorPage supabase={supabase} viewer={profile} id={id} />;
}
