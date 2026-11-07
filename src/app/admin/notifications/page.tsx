import { requireRole } from "@/lib/auth";
import { NotificationsPage } from "@/components/portal/NotificationsPage";

export const metadata = { title: "Notifications" };

export default async function Page() {
  const { supabase, profile } = await requireRole("admin");
  return <NotificationsPage supabase={supabase} viewer={profile} />;
}
