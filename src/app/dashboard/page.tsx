import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";

export default async function DashboardRedirect() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(homeFor(session.profile.role));
}
