"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "../actions";
import { AuthCard } from "../AuthCard";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(requestPasswordReset, {});
  return (
    <AuthCard title="Reset your password">
      {state.ok ? (
        <FormMessage state={state} />
      ) : (
        <form action={action} className="space-y-4">
          <FormMessage state={state} />
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <SubmitButton pendingText="Sending…" className="btn-primary w-full">
            Send reset link
          </SubmitButton>
        </form>
      )}
      <Link href="/login" className="mt-4 block text-center text-sm text-brand-700 hover:underline">
        Back to log in
      </Link>
    </AuthCard>
  );
}
