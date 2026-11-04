import { requireRole } from "@/lib/auth";
import { AnnouncementsList } from "@/components/portal/Announcements";

export const metadata = { title: "Announcements" };

export default async function Page() {
  const { supabase, profile } = await requireRole("teacher");
  return <AnnouncementsList supabase={supabase} viewer={profile} />;
}
