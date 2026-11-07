"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import type { ActionState } from "@/lib/types";

// Typed-name signature with explicit consent (CON-02). Once signed, the form is replaced by
// the confirmation so it can't be submitted twice.
export function SignForm({ action, signerLabel, placeholder }: { action: (prev: ActionState, f: FormData) => Promise<ActionState>; signerLabel: string; placeholder: string }) {
  const [state, formAction] = useActionState(action, {});
  if (state.ok) return <p className="mt-4 rounded-lg bg-green-50 px-3 py-3 text-sm text-green-800">{state.message}</p>;
  return (
    <form action={formAction} className="mt-4 space-y-3">
      <FormMessage state={state} />
      <div className="max-w-sm">
        <label className="label" htmlFor="signer_name">{signerLabel}</label>
        <input className="input" id="signer_name" name="signer_name" required minLength={2} maxLength={200} autoComplete="name" placeholder={placeholder} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="agree" required className="mt-1" />
        <span>I have read this agreement and agree to it. I understand that typing my name here is my electronic signature.</span>
      </label>
      <p className="text-xs text-muted">The time, your IP address and browser are recorded with your signature, and a PDF copy is emailed to you.</p>
      <SubmitButton pendingText="Signing…">Sign contract</SubmitButton>
    </form>
  );
}
