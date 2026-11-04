import { requireRole } from "@/lib/auth";
import { PortalShell, type NavItem } from "@/components/PortalShell";

const nav: NavItem[] = [
  { href: "/student", label: "Dashboard" },
  { href: "/student/profile", label: "My Profile" },
  { href: "/student/teacher", label: "My Teacher" },
  { href: "/student/calendar", label: "My Calendar", phase: 2 },
  { href: "/student/materials", label: "Lesson Materials", phase: 2 },
  { href: "/student/lessons", label: "Lesson History", phase: 2 },
  { href: "/student/homework", label: "Homework", phase: 3 },
  { href: "/student/policies", label: "Class Policies", phase: 4 },
  { href: "/student/contract", label: "My Contract", phase: 5 },
  { href: "/student/progress", label: "My Progress", phase: 6 },
  { href: "/student/messages", label: "Messages", phase: 6 },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("student");
  return (
    <PortalShell profile={profile} roleLabel="Student" nav={nav}>
      {children}
    </PortalShell>
  );
}
