import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { NewUserForm } from "./NewUserForm";

export const metadata = { title: "Add user" };

export default async function NewUserPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  await requireRole("admin");
  const { role } = await searchParams;
  return (
    <>
      <PageHeader title="Add a user" description="Accounts are created by the school; there is no public sign-up." />
      <NewUserForm defaultRole={role === "teacher" || role === "admin" ? role : "student"} />
    </>
  );
}
