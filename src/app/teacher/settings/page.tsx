import { requireRole } from "@/lib/auth";
import { SettingsPage } from "@/components/portal/SettingsPage";

export const metadata = { title: "Settings" };

export default async function Page() {
  const { supabase, profile } = await requireRole("teacher");
  return <SettingsPage supabase={supabase} viewer={profile} />;
}
