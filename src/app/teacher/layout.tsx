import { requireRole } from "@/lib/auth";
import { PortalShell, type NavItem } from "@/components/PortalShell";
import { unreadMessageCount } from "@/lib/messages";

const nav = (unread: number): NavItem[] => [
  { href: "/teacher", label: "Dashboard" },
  { href: "/teacher/profile", label: "My Profile" },
  { href: "/teacher/students", label: "My Students" },
  { href: "/teacher/calendar", label: "My Calendar" },
  { href: "/teacher/availability", label: "Available Hours" },
  { href: "/teacher/lessons", label: "Lesson Records" },
  { href: "/teacher/homework", label: "Homework" },
  { href: "/teacher/progress", label: "Student Progress" },
  { href: "/teacher/messages", label: "Messages", badge: unread },
  { href: "/teacher/announcements", label: "Announcements" },
  { href: "/teacher/policies", label: "Class Policies" },
  { href: "/teacher/settings", label: "Settings" },
];

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { profile, supabase } = await requireRole("teacher");
  const unread = await unreadMessageCount(supabase);
  return (
    <PortalShell profile={profile} roleLabel="Teacher" nav={nav(unread)}>
      {children}
    </PortalShell>
  );
}
