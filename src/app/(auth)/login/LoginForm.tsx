"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/ui";

export function LoginForm({ next, initialError }: { next?: string; initialError?: string }) {
  const [state, action] = useActionState(signIn, initialError ? { error: initialError } : {});
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="password">Password</label>
          <Link href="/forgot-password" className="mb-1 text-xs text-brand-700 hover:underline">
            Forgot password?
          </Link>
        </div>
        <input className="input" id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      <SubmitButton pendingText="Logging in…" className="btn-primary w-full">
        Log in
      </SubmitButton>
      <p className="text-center text-xs text-muted">Accounts are created by the school. New student? <Link href="/contact#trial" className="text-brand-700 hover:underline">Book a trial</Link>.</p>
    </form>
  );
}
