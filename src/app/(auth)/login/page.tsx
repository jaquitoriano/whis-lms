import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";
import { AuthCard } from "../AuthCard";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const session = await getSession();
  if (session && session.profile.status !== "inactive") redirect(homeFor(session.profile.role));
  return (
    <AuthCard title="Log in">
      <LoginForm next={next} initialError={error === "inactive" ? "This account is inactive. Please contact the school office." : undefined} />
    </AuthCard>
  );
}
