import { requireRole } from "@/lib/auth";
import { PortalShell, type NavItem } from "@/components/PortalShell";

const nav: NavItem[] = [
  { href: "/teacher", label: "Dashboard" },
  { href: "/teacher/profile", label: "My Profile" },
  { href: "/teacher/students", label: "My Students" },
  { href: "/teacher/calendar", label: "My Calendar" },
  { href: "/teacher/availability", label: "Available Hours" },
  { href: "/teacher/lessons", label: "Lesson Records" },
  { href: "/teacher/homework", label: "Homework" },
  { href: "/teacher/policies", label: "Class Policies", phase: 4 },
  { href: "/teacher/progress", label: "Student Progress", phase: 6 },
  { href: "/teacher/messages", label: "Messages", phase: 6 },
];

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("teacher");
  return (
    <PortalShell profile={profile} roleLabel="Teacher" nav={nav}>
      {children}
    </PortalShell>
  );
}
