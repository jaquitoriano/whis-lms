import { requireRole } from "@/lib/auth";
import { SettingsPage } from "@/components/portal/SettingsPage";

export const metadata = { title: "My account" };

export default async function Page() {
  const { supabase, profile } = await requireRole("admin");
  return <SettingsPage supabase={supabase} viewer={profile} />;
}
