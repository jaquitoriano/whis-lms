import { requireRole } from "@/lib/auth";
import { PoliciesPage } from "@/components/portal/Policies";

export const metadata = { title: "Class Policies" };

export default async function Page() {
  const { supabase, profile } = await requireRole("teacher");
  return <PoliciesPage supabase={supabase} viewer={profile} />;
}
