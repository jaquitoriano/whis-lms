import { requireRole } from "@/lib/auth";
import { PortalShell, type NavItem } from "@/components/PortalShell";

const nav: NavItem[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users?role=teacher", label: "Teachers" },
  { href: "/admin/users?role=student", label: "Students" },
  { href: "/admin/courses", label: "Courses" },
  { href: "/admin/inquiries", label: "Inquiries" },
  { href: "/admin/settings", label: "Website settings" },
  { href: "/admin/schedules", label: "Class schedules" },
  { href: "/admin/lessons", label: "Lesson records" },
  { href: "/admin/homework", label: "Homework monitoring" },
  { href: "/admin/announcements", label: "Announcements", phase: 4 },
  { href: "/admin/attendance", label: "Attendance", phase: 5 },
  { href: "/admin/billing", label: "Payments and billing", phase: 5 },
  { href: "/admin/reports", label: "Reports", phase: 7 },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("admin");
  return (
    <PortalShell profile={profile} roleLabel="Admin" nav={nav}>
      {children}
    </PortalShell>
  );
}
