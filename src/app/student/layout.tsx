import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { PortalShell, type NavItem } from "@/components/PortalShell";

const nav: NavItem[] = [
  { href: "/student", label: "Dashboard" },
  { href: "/student/profile", label: "My Profile" },
  { href: "/student/teacher", label: "My Teacher" },
  { href: "/student/calendar", label: "My Calendar" },
  { href: "/student/materials", label: "Lesson Materials" },
  { href: "/student/lessons", label: "Lesson History" },
  { href: "/student/homework", label: "Homework" },
  { href: "/student/announcements", label: "Announcements" },
  { href: "/student/policies", label: "Class Policies" },
  { href: "/student/settings", label: "Settings" },
  { href: "/student/contract", label: "My Contract", phase: 5 },
  { href: "/student/progress", label: "My Progress", phase: 6 },
  { href: "/student/messages", label: "Messages", phase: 6 },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { profile, supabase } = await requireRole("student");
  // POL-04: until the student accepts the latest class policies, the whole student area
  // redirects to the acceptance page (which sits outside this layout, so it can't loop,
  // and no page data is sent before acceptance).
  const { data: mustAccept } = await supabase.rpc("needs_policy_acceptance");
  if (mustAccept) redirect("/accept-policies");
  return (
    <PortalShell profile={profile} roleLabel="Student" nav={nav}>
      {children}
    </PortalShell>
  );
}
